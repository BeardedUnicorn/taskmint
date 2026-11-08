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
 * A fake appdata.json: what get_app_records / set_app_record operate on, with
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
  it("are the backend's record keys, under their STORAGE_KEYS names", () => {
    expect([...APP_RECORD_KEYS]).toEqual([
      STORAGE_KEYS.PREDEFINED_TASKS,
      STORAGE_KEYS.TASK_NOTES,
      STORAGE_KEYS.NOTE_TEMPLATES,
      STORAGE_KEYS.DAILY_GOAL,
      STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS,
      STORAGE_KEYS.WITHDRAWALS,
    ]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetAppRecordsForTests();
  });

  it('refuses reads and writes before the records load', () => {
    expect(() => readAppRecord('predefinedTasks')).toThrow('App records are not loaded');
    expect(() => writeAppRecord('predefinedTasks', tasks)).toThrow('App records are not loaded');
  });

  it('loads the records from the backend', async () => {
    fakeAppData({ predefinedTasks: tasks });

    await loadAppRecords();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('get_app_records');
    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('hands out copies, so callers changing them leave the cache alone', async () => {
    fakeAppData({ predefinedTasks: tasks });
    await loadAppRecords();

    const copy = readAppRecord('predefinedTasks') as typeof tasks;
    copy.push({ id: 't2', name: 'Review' });

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('writes in order per record, and null removes it', async () => {
    const file = fakeAppData();
    await loadAppRecords();
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
    await loadAppRecords();
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));

    const failed = writeAppRecord('predefinedTasks', []);
    // The cache shows the new value while the write is pending
    expect(readAppRecord('predefinedTasks')).toEqual([]);
    await expect(failed).rejects.toThrow('disk full');

    expect(readAppRecord('predefinedTasks')).toEqual(tasks);
  });

  it('brings back a record whose removal failed, but not over a newer write', async () => {
    fakeAppData({ predefinedTasks: tasks });
    await loadAppRecords();
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
      await loadAppRecords();
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
      await loadAppRecords();
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
      await loadAppRecords();
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
      await loadAppRecords();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockInvoke.mockRejectedValueOnce('offline');

      fakeBackend().emit(EVENTS.APP_RECORDS_CHANGED, { key: 'dailyGoal', revision: 4 });

      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Failed to read the records again:', 'offline'));
      error.mockRestore();
    });

    it('refuses a save made from a stale version, and takes the newer one', async () => {
      const file = fakeAppData({ predefinedTasks: tasks });
      await loadAppRecords();
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
