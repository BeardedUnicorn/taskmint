import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  APP_RECORD_KEYS,
  RECORD_CONFLICT,
  flushAppRecords,
  loadAppRecords,
  readAppRecord,
  resetAppRecordsForTests,
  subscribeToAppRecords,
  writeAppRecord,
} from '../appRecords';
import { CORE_ERRORS, EVENTS } from '@taskmint/contracts';
import { fakeBackend } from '../../testing';
import { STORAGE_KEYS } from '../../constants';

const mockInvoke = fakeBackend().call;
const tasks = [{ id: 't1', name: 'Annotation' }];

/**
 * A fake appdata.json: what get_app_records / import / set operate on, with
 * each record's revision counted as the backend counts it.
 */
function fakeAppData(initial: Record<string, unknown> = {}) {
  const file = {
    records: structuredClone(initial) as Record<string, any>,
    revisions: {} as Record<string, number>,
  };
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
      case 'set_app_record': {
        const revision = file.revisions[args.key] ?? 0;
        if (args.baseRevision !== undefined && args.baseRevision !== revision) {
          throw CORE_ERRORS.RECORD_CONFLICT;
        }
        if (args.value === null) delete file.records[args.key];
        else file.records[args.key] = args.value;
        file.revisions[args.key] = revision + 1;
        return { revision: revision + 1 };
      }
      default:
        throw new Error(`unexpected ${command}`);
    }
  });
  return file;
}

describe('appRecords', () => {
  it("are the backend's record keys, under the names older versions stored them by", () => {
    expect([...APP_RECORD_KEYS]).toEqual([
      STORAGE_KEYS.PREDEFINED_TASKS,
      STORAGE_KEYS.TASK_NOTES,
      STORAGE_KEYS.NOTE_TEMPLATES,
      STORAGE_KEYS.DAILY_GOAL,
      STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS,
    ]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetAppRecordsForTests();
    window.localStorage.clear();
  });

  it('refuses reads and writes before the records load', () => {
    expect(() => readAppRecord('predefinedTasks')).toThrow('App records are not loaded');
    expect(() => writeAppRecord('predefinedTasks', tasks)).toThrow('App records are not loaded');
  });

  it('moves records from an older version in from localStorage, then removes those copies', async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify(tasks));
    // useLocalStorage's version wrapper is unwrapped
    window.localStorage.setItem(
      'dailyGoal',
      JSON.stringify({ version: 1, data: { targetAmount: 100 }, migratedAt: '2026-10-01T00:00:00Z' })
    );
    window.localStorage.setItem('theme-mode', JSON.stringify('dark'));
    const file = fakeAppData();

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
    fakeAppData({ predefinedTasks: tasks, dailyGoal: { targetAmount: 100 } });

    await loadAppRecords({ importLegacy: true });

    expect(readAppRecord('predefinedTasks')).toEqual([...tasks, { id: 't9' }]);
    expect(readAppRecord('dailyGoal')).toEqual({ targetAmount: 100 });
  });

  it('keeps the localStorage copies when the move fails', async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify(tasks));
    mockInvoke.mockRejectedValue(new Error('disk full'));

    await expect(loadAppRecords({ importLegacy: true })).rejects.toThrow('disk full');

    expect(() => readAppRecord('predefinedTasks')).toThrow('App records are not loaded');
    expect(window.localStorage.getItem('predefinedTasks')).not.toBeNull();
  });

  it('just loads the file once nothing is left to move', async () => {
    fakeAppData({ predefinedTasks: tasks });

    await loadAppRecords({ importLegacy: true });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('get_app_records');
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('clears records that are empty in localStorage without moving anything', async () => {
    window.localStorage.setItem('dailyGoal', JSON.stringify({ version: 1, data: null }));
    window.localStorage.setItem('taskNotes', '{ not json');
    fakeAppData();

    await loadAppRecords({ importLegacy: true });

    expect(mockInvoke).not.toHaveBeenCalledWith('import_app_records', expect.anything());
    expect(window.localStorage.getItem('dailyGoal')).toBeNull();
    // Unreadable values are left alone
    expect(window.localStorage.getItem('taskNotes')).toBe('{ not json');
  });

  it("doesn't move localStorage records unless asked to (a development build)", async () => {
    window.localStorage.setItem('predefinedTasks', JSON.stringify([{ id: 'dev-only' }]));
    fakeAppData({ predefinedTasks: tasks });

    await loadAppRecords({ importLegacy: false });

    expect(mockInvoke).not.toHaveBeenCalledWith('import_app_records', expect.anything());
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
    expect(window.localStorage.getItem('predefinedTasks')).not.toBeNull();
  });

  it('removes keys earlier versions left behind, and keeps settings', async () => {
    const left = {
      predefinedTasks_backup_1791001697839: '{}',
      noteTemplates_backup_1791001712854: '{}',
      timeEntries: '[]',
      timeEntries_backup_1700000000000: '[]',
      dashboardWidgetPrefs: '{}',
    };
    for (const [key, value] of Object.entries(left)) window.localStorage.setItem(key, value);
    window.localStorage.setItem('inactivitySettings', '{}');
    fakeAppData({ predefinedTasks: tasks });

    await loadAppRecords({ importLegacy: true });

    for (const key of Object.keys(left)) expect(window.localStorage.getItem(key)).toBeNull();
    expect(window.localStorage.getItem('inactivitySettings')).toBe('{}');
  });

  it('leaves a development build’s leftovers alone', async () => {
    window.localStorage.setItem('predefinedTasks_backup_1', '{}');
    fakeAppData({ predefinedTasks: tasks });

    await loadAppRecords({ importLegacy: false });

    expect(window.localStorage.getItem('predefinedTasks_backup_1')).toBe('{}');
  });

  it('hands out copies, so callers changing them leave the cache alone', async () => {
    fakeAppData({ predefinedTasks: tasks });
    await loadAppRecords({ importLegacy: false });

    const copy = readAppRecord('predefinedTasks') as typeof tasks;
    copy.push({ id: 't2', name: 'Review' });

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('writes in order per record, and null removes it', async () => {
    const file = fakeAppData();
    await loadAppRecords({ importLegacy: false });
    const order: string[] = [];
    mockInvoke.mockImplementation(async (_command: string, args?: any) => {
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

    fakeAppData(file.records).revisions.dailyGoal = 2;
    await writeAppRecord('dailyGoal', null);
    expect(readAppRecord('dailyGoal')).toBeUndefined();
    expect(mockInvoke).toHaveBeenLastCalledWith('set_app_record', { key: 'dailyGoal', value: null, baseRevision: 2 });
  });

  it('puts the previous value back when a write fails', async () => {
    fakeAppData({ predefinedTasks: tasks });
    await loadAppRecords({ importLegacy: false });
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));

    const failed = writeAppRecord('predefinedTasks', []);
    // The cache shows the new value while the write is pending
    expect(readAppRecord('predefinedTasks')).toEqual([]);
    await expect(failed).rejects.toThrow('disk full');

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('brings back a record whose removal failed, but not over a newer write', async () => {
    fakeAppData({ predefinedTasks: tasks });
    await loadAppRecords({ importLegacy: false });
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));
    await expect(writeAppRecord('predefinedTasks', null)).rejects.toThrow('disk full');
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
    // A record that wasn't there isn't there after a failed first save
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));
    await expect(writeAppRecord('dailyGoal', { targetAmount: 1 })).rejects.toThrow('disk full');
    expect(readAppRecord('dailyGoal')).toBeUndefined();

    // The first write fails after a second one replaced its value
    mockInvoke.mockImplementationOnce(async () => {
      throw new Error('disk full');
    });
    const failed = writeAppRecord('predefinedTasks', []);
    void writeAppRecord('predefinedTasks', [{ id: 't3', name: 'Later' }]).catch(() => {});
    await expect(failed).rejects.toThrow('disk full');
    expect(readAppRecord('predefinedTasks')).toEqual([{ id: 't3', name: 'Later' }]);
  });

  it("carries on when it can't list what's in localStorage", async () => {
    fakeAppData({ predefinedTasks: tasks });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.localStorage.setItem('timeEntries', '[]');
    vi.mocked(window.localStorage.key).mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    await loadAppRecords({ importLegacy: true });
    expect(error).toHaveBeenCalledWith('Failed to remove retired localStorage keys:', expect.any(Error));
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
    error.mockRestore();
  });

  describe('changes made elsewhere', () => {
    /** Another tab saves `key`: the stored record and its revision move on. */
    function savedElsewhere(file: ReturnType<typeof fakeAppData>, key: string, value: unknown) {
      if (value === null) delete file.records[key];
      else file.records[key] = value;
      file.revisions[key] = (file.revisions[key] ?? 0) + 1;
      return file.revisions[key];
    }

    it('takes a record another tab saved, and tells its listeners', async () => {
      const file = fakeAppData({ dailyGoal: { targetAmount: 50 } });
      await loadAppRecords({ importLegacy: false });
      const listener = vi.fn();
      const unsubscribe = subscribeToAppRecords(listener);

      const revision = savedElsewhere(file, 'dailyGoal', { targetAmount: 80 });
      fakeBackend().emit(EVENTS.APP_RECORDS_CHANGED, { key: 'dailyGoal', revision });

      await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ keys: ['dailyGoal'], conflict: false }));
      expect(readAppRecord('dailyGoal')).toEqual({ targetAmount: 80 });
      // The next save builds on that revision
      await writeAppRecord('dailyGoal', { targetAmount: 90 });
      expect(file.revisions.dailyGoal).toBe(2);

      unsubscribe();
      savedElsewhere(file, 'dailyGoal', null);
      fakeBackend().emit(EVENTS.APP_RECORDS_CHANGED, { key: 'dailyGoal', revision: 3 });
      await vi.waitFor(() => expect(readAppRecord('dailyGoal')).toBeUndefined());
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("skips its own saves' events, and events for other keys", async () => {
      fakeAppData();
      await loadAppRecords({ importLegacy: false });
      mockInvoke.mockClear();
      const listener = vi.fn();
      subscribeToAppRecords(listener);

      // Announced before the save settles, then after
      const saving = writeAppRecord('taskNotes', [{ id: 'n1' }]);
      fakeBackend().emit(EVENTS.APP_RECORDS_CHANGED, { key: 'taskNotes', revision: 1 });
      await saving;
      fakeBackend().emit(EVENTS.APP_RECORDS_CHANGED, { key: 'taskNotes', revision: 1 });
      fakeBackend().emit(EVENTS.APP_RECORDS_CHANGED, { key: 'theme-mode', revision: 9 });
      await flushAppRecords();

      expect(listener).not.toHaveBeenCalled();
      expect(mockInvoke).not.toHaveBeenCalledWith('get_app_records');
    });

    it('reads every record again on resync, except those being saved', async () => {
      const file = fakeAppData({ taskNotes: [] });
      await loadAppRecords({ importLegacy: false });
      const listener = vi.fn();
      subscribeToAppRecords(listener);
      savedElsewhere(file, 'taskNotes', [{ id: 'remote' }]);

      let finish = () => {};
      mockInvoke.mockImplementationOnce(
        (_command: string, args?: any) =>
          new Promise(resolve => {
            finish = () => {
              file.records[args.key] = args.value;
              resolve({ revision: 1 });
            };
          })
      );
      const saving = writeAppRecord('dailyGoal', { targetAmount: 5 });
      await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('set_app_record', expect.anything()));
      fakeBackend().emit(EVENTS.RESYNC, {});

      await vi.waitFor(() => expect(listener).toHaveBeenCalled());
      const [{ keys }] = listener.mock.calls[0];
      expect(keys).not.toContain('dailyGoal');
      expect(keys).toContain('taskNotes');
      expect(readAppRecord('taskNotes')).toEqual([{ id: 'remote' }]);
      finish();
      await saving;
      expect(readAppRecord('dailyGoal')).toEqual({ targetAmount: 5 });
    });

    it('logs when it cannot read the records again', async () => {
      fakeAppData();
      await loadAppRecords({ importLegacy: false });
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockInvoke.mockRejectedValueOnce('offline');

      fakeBackend().emit(EVENTS.APP_RECORDS_CHANGED, { key: 'dailyGoal', revision: 4 });

      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Failed to read the records again:', 'offline'));
      error.mockRestore();
    });

    it('refuses a save made from a stale version, and takes the newer one', async () => {
      const file = fakeAppData({ predefinedTasks: tasks });
      await loadAppRecords({ importLegacy: false });
      const listener = vi.fn();
      subscribeToAppRecords(listener);
      // Saved elsewhere, and this tab hasn't heard yet
      savedElsewhere(file, 'predefinedTasks', [{ id: 'remote', name: 'Theirs' }]);

      const stale = writeAppRecord('predefinedTasks', [{ id: 'local', name: 'Mine' }]);
      // A save queued behind it was based on the stale version too
      const queued = writeAppRecord('predefinedTasks', [{ id: 'local', name: 'Mine, again' }]);

      await expect(stale).rejects.toBe(RECORD_CONFLICT);
      await expect(queued).rejects.toBe(RECORD_CONFLICT);
      expect(readAppRecord('predefinedTasks')).toEqual([{ id: 'remote', name: 'Theirs' }]);
      expect(file.records.predefinedTasks).toEqual([{ id: 'remote', name: 'Theirs' }]);
      expect(listener).toHaveBeenCalledWith({ keys: ['predefinedTasks'], conflict: true });
      expect(listener).toHaveBeenCalledTimes(2);

      // Saves from the newer version go through
      await writeAppRecord('predefinedTasks', []);
      expect(file.records.predefinedTasks).toEqual([]);
    });
  });
});
