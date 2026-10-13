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
function fakeBackend(initial: Record<string, unknown> = {}) {
  const file = { records: structuredClone(initial) as Record<string, any> };
  mockInvoke.mockImplementation(async (command: string, args?: any) => {
    switch (command) {
      case 'get_app_records':
        return structuredClone(file);
      case 'import_app_records':
        // Like the backend: lists gain items by id, anything stored stays
        for (const [key, value] of Object.entries<any>(args.records)) {
          const stored = file.records[key];
          if (stored == null) file.records[key] = value;
          else if (Array.isArray(stored)) {
            const ids = new Set(stored.map((item: any) => item.id));
            stored.push(...value.filter((item: any) => !ids.has(item.id)));
          }
        }
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
    await loadAppRecords({ importLegacy: true });
    expect(appRecordsActive()).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('moves records from an older version in from localStorage, then removes those copies', async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify(tasks));
    // useLocalStorage's version wrapper is unwrapped
    window.localStorage.setItem(
      'dailyGoal',
      JSON.stringify({ version: 1, data: { targetAmount: 100 }, migratedAt: '2026-10-01T00:00:00Z' })
    );
    window.localStorage.setItem('theme-mode', JSON.stringify('dark'));
    const file = fakeBackend();

    await loadAppRecords({ importLegacy: true });

    expect(mockInvoke).toHaveBeenCalledWith('import_app_records', {
      records: { predefinedTasks: tasks, dailyGoal: { targetAmount: 100 } },
    });
    expect(file.records).toEqual({ predefinedTasks: tasks, dailyGoal: { targetAmount: 100 } });
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
    expect(window.localStorage.getItem('predefinedTasks')).toBeNull();
    expect(window.localStorage.getItem('dailyGoal')).toBeNull();
    // Settings aren't records and stay put
    expect(window.localStorage.getItem('theme-mode')).not.toBeNull();
  });

  it('adds moved records to the ones already in the file without replacing them', async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify([{ id: 't1', name: 'Old copy' }, { id: 't9' }]));
    window.localStorage.setItem('dailyGoal', JSON.stringify({ targetAmount: 999 }));
    fakeBackend({ predefinedTasks: tasks, dailyGoal: { targetAmount: 100 } });

    await loadAppRecords({ importLegacy: true });

    expect(readAppRecord('predefinedTasks')).toEqual([...tasks, { id: 't9' }]);
    expect(readAppRecord('dailyGoal')).toEqual({ targetAmount: 100 });
  });

  it('keeps the localStorage copies when the move fails', async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify(tasks));
    mockInvoke.mockRejectedValue(new Error('disk full'));

    await expect(loadAppRecords({ importLegacy: true })).rejects.toThrow('disk full');

    expect(appRecordsActive()).toBe(false);
    expect(window.localStorage.getItem('predefinedTasks')).not.toBeNull();
  });

  it('just loads the file once nothing is left to move', async () => {
    fakeBackend({ predefinedTasks: tasks });

    await loadAppRecords({ importLegacy: true });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('get_app_records');
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('clears records that are empty in localStorage without moving anything', async () => {
    window.localStorage.setItem('dailyGoal', JSON.stringify({ version: 1, data: null }));
    window.localStorage.setItem('taskNotes', '{ not json');
    fakeBackend();

    await loadAppRecords({ importLegacy: true });

    expect(mockInvoke).not.toHaveBeenCalledWith('import_app_records', expect.anything());
    expect(window.localStorage.getItem('dailyGoal')).toBeNull();
    // Unreadable values are left alone
    expect(window.localStorage.getItem('taskNotes')).toBe('{ not json');
  });

  it("doesn't move localStorage records in a development build", async () => {
    expect(import.meta.env.DEV).toBe(true);
    window.localStorage.setItem('predefinedTasks', JSON.stringify([{ id: 'dev-only' }]));
    fakeBackend({ predefinedTasks: tasks });

    await loadAppRecords();

    expect(mockInvoke).not.toHaveBeenCalledWith('import_app_records', expect.anything());
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
    expect(window.localStorage.getItem('predefinedTasks')).not.toBeNull();
  });

  it('hands out copies, so callers changing them leave the cache alone', async () => {
    fakeBackend({ predefinedTasks: tasks });
    await loadAppRecords();

    const copy = readAppRecord('predefinedTasks') as typeof tasks;
    copy.push({ id: 't2', name: 'Review' });

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it("writes in order per record, and null removes it", async () => {
    const file = fakeBackend();
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

    fakeBackend(file.records);
    await writeAppRecord('dailyGoal', null);
    expect(readAppRecord('dailyGoal')).toBeUndefined();
    expect(mockInvoke).toHaveBeenLastCalledWith('set_app_record', { key: 'dailyGoal', value: null });
  });

  it('puts the previous value back when a write fails', async () => {
    fakeBackend({ predefinedTasks: tasks });
    await loadAppRecords();
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));

    const failed = writeAppRecord('predefinedTasks', []);
    // The cache shows the new value while the write is pending
    expect(readAppRecord('predefinedTasks')).toEqual([]);
    await expect(failed).rejects.toThrow('disk full');

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });
});
