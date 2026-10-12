import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  appRecordsActive,
  flushAppRecords,
  loadAppRecords,
  readAppRecord,
  resetAppRecordsForTests,
  writeAppRecord,
} from '../appRecords';
import { isTauriEnvironment } from '../../utils/tauri';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../utils/tauri', () => ({ isTauriEnvironment: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const tasks = [{ id: 't1', name: 'Annotation' }];

/** A fake appdata.json: what get_app_records / import / set operate on. */
function fakeBackend(initial: { records?: Record<string, unknown>; initialized?: boolean } = {}) {
  const file = { records: { ...(initial.records ?? {}) }, initialized: initial.initialized ?? false };
  mockInvoke.mockImplementation(async (command: string, args?: any) => {
    switch (command) {
      case 'get_app_records':
        return structuredClone(file);
      case 'import_app_records':
        for (const [key, value] of Object.entries(args.records)) {
          if (file.records[key] == null) file.records[key] = value;
        }
        file.initialized = true;
        return structuredClone(file);
      case 'set_app_record':
        if (args.value === null) delete file.records[args.key];
        else file.records[args.key] = args.value;
        return null;
      default:
        throw new Error(`unexpected ${command}`);
    }
  });
  return file;
}

describe('appRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppRecordsForTests();
    window.localStorage.clear();
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
  });

  it('stays inactive outside the app', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(false);
    await loadAppRecords();
    expect(appRecordsActive()).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('moves the records in from localStorage on the first launch, then removes those copies', async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify(tasks));
    // useLocalStorage's version wrapper is unwrapped
    window.localStorage.setItem(
      'dailyGoal',
      JSON.stringify({ version: 1, data: { targetAmount: 100 }, migratedAt: '2026-10-01T00:00:00Z' })
    );
    window.localStorage.setItem('theme-mode', JSON.stringify('dark'));
    const file = fakeBackend();

    await loadAppRecords();

    expect(file.records).toEqual({ predefinedTasks: tasks, dailyGoal: { targetAmount: 100 } });
    expect(file.initialized).toBe(true);
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
    expect(window.localStorage.getItem('predefinedTasks')).toBeNull();
    expect(window.localStorage.getItem('dailyGoal')).toBeNull();
    // Settings aren't records and stay put
    expect(window.localStorage.getItem('theme-mode')).not.toBeNull();
  });

  it('keeps the localStorage copies when the move fails', async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify(tasks));
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_app_records') return { records: {}, initialized: false };
      throw new Error('disk full');
    });

    await expect(loadAppRecords()).rejects.toThrow('disk full');

    expect(appRecordsActive()).toBe(false);
    expect(window.localStorage.getItem('predefinedTasks')).not.toBeNull();
  });

  it("doesn't import again once the records are in the file", async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify([{ id: 'stale' }]));
    fakeBackend({ records: { predefinedTasks: tasks }, initialized: true });

    await loadAppRecords();

    expect(mockInvoke).not.toHaveBeenCalledWith('import_app_records', expect.anything());
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('hands out copies, so callers changing them leave the cache alone', async () => {
    fakeBackend({ records: { predefinedTasks: tasks }, initialized: true });
    await loadAppRecords();

    const copy = readAppRecord('predefinedTasks') as typeof tasks;
    copy.push({ id: 't2', name: 'Review' });

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it("writes in order per record, and null removes it", async () => {
    const file = fakeBackend({ initialized: true });
    await loadAppRecords();
    const order: string[] = [];
    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      // The first write is slower than the second
      await new Promise(resolve => setTimeout(resolve, args.value === 'first' ? 20 : 0));
      order.push(String(args.value));
      file.records[args.key] = args.value;
      return null;
    });

    void writeAppRecord('dailyGoal', 'first');
    void writeAppRecord('dailyGoal', 'second');
    await flushAppRecords();

    expect(order).toEqual(['first', 'second']);
    expect(file.records.dailyGoal).toBe('second');
    expect(readAppRecord('dailyGoal')).toBe('second');

    fakeBackend({ records: file.records, initialized: true });
    await writeAppRecord('dailyGoal', null);
    expect(readAppRecord('dailyGoal')).toBeUndefined();
    expect(mockInvoke).toHaveBeenLastCalledWith('set_app_record', { key: 'dailyGoal', value: null });
  });

  it('puts the previous value back when a write fails', async () => {
    fakeBackend({ records: { predefinedTasks: tasks }, initialized: true });
    await loadAppRecords();
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));

    const failed = writeAppRecord('predefinedTasks', []);
    // The cache shows the new value while the write is pending
    expect(readAppRecord('predefinedTasks')).toEqual([]);
    await expect(failed).rejects.toThrow('disk full');

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });
});
