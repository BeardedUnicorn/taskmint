import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBackupFrequencyLabel, getNextBackupTime, isBackupDue, type BackupFrequency } from '../backup';

afterEach(() => {
  vi.useRealTimers();
});

describe('backup frequencies', () => {
  it('have labels', () => {
    expect((['daily', 'weekly', 'monthly'] as const).map(getBackupFrequencyLabel)).toEqual(['Daily', 'Weekly', 'Monthly']);
  });

  it('put the next backup a day, a week or a month after the last', () => {
    const last = '2026-01-31T09:00:00.000Z';
    expect(getNextBackupTime('daily', last).toISOString()).toBe('2026-02-01T09:00:00.000Z');
    expect(getNextBackupTime('weekly', last).toISOString()).toBe('2026-02-07T09:00:00.000Z');
    const midMonth = new Date(2026, 0, 15, 9, 0);
    expect(getNextBackupTime('monthly', midMonth.toISOString())).toEqual(new Date(2026, 1, 15, 9, 0));
    // A setting stored by something else counts as daily
    expect(getNextBackupTime('hourly' as BackupFrequency, last).toISOString()).toBe('2026-02-01T09:00:00.000Z');
  });

  it('count from now without a last backup', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T12:00:00.000Z'));
    expect(getNextBackupTime('daily').toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });

  it('make a backup due when enabled and its time has come', () => {
    const config = { enabled: true, frequency: 'daily' as const, backupPath: '/b', maxBackups: 5 };
    expect(isBackupDue(config)).toBe(true);
    expect(isBackupDue({ ...config, enabled: false })).toBe(false);
    expect(isBackupDue({ ...config, lastBackupTime: new Date().toISOString() })).toBe(false);
    expect(isBackupDue({ ...config, lastBackupTime: '2020-01-01T00:00:00.000Z' })).toBe(true);
  });
});
