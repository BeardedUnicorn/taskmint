import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackup, getDataVersion, migrateData, needsMigration } from '../dataMigration';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('data versions', () => {
  it("are a value's version, or 0 for one saved before versioning", () => {
    expect(getDataVersion({ version: 1, data: [] })).toBe(1);
    for (const old of [{ tasks: [] }, [], 'text', null, undefined]) {
      expect(getDataVersion(old)).toBe(0);
      expect(needsMigration(old)).toBe(true);
    }
  });

  it('wrap an old value once, and leave a current one alone', () => {
    const current = { version: 1, data: ['a'] };
    expect(migrateData('tasks', current)).toBe(current);
    expect(migrateData('tasks', ['a'])).toEqual({
      version: 1,
      data: ['a'],
      migratedAt: expect.any(String),
      originalVersion: 0,
    });
  });
});

describe('createBackup', () => {
  it('keeps a copy, and only the newest five', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.setItem('other_backup_1', 'kept');
    for (let n = 0; n < 7; n++) {
      vi.setSystemTime(1_760_000_000_000 + n);
      createBackup('tasks', [n]);
    }
    const stored = Array.from({ length: localStorage.length }, (_, i) => String(localStorage.key(i)));
    const copies = stored.filter(name => name.startsWith('tasks_backup_')).sort();
    expect(copies).toEqual([2, 3, 4, 5, 6].map(n => `tasks_backup_${1_760_000_000_000 + n}`));
    expect(JSON.parse(localStorage.getItem(copies[4])!)).toEqual({
      originalKey: 'tasks',
      data: [6],
      backedUpAt: new Date(1_760_000_000_006).toISOString(),
      version: 0,
    });
    expect(localStorage.getItem('other_backup_1')).toBe('kept');
  });

  it("says so when it can't", () => {
    vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createBackup('tasks', []);
    expect(error).toHaveBeenCalledWith('Failed to create backup for "tasks":', expect.any(Error));
  });
});
