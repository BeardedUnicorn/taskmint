import { beforeEach, describe, expect, it } from 'vitest';
import { applyDeviceSettings, DeviceSettingsSchema, readDeviceSettings } from '../deviceSettings';
import { readLocal, writeLocal } from '../localStore';

const BACKUPS = { enabled: true, frequency: 'weekly', backupPath: '/Backups', maxBackups: 5 } as const;

describe('device settings in a backup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('are the ones this device saved, without when it last backed up', () => {
    expect(readDeviceSettings()).toEqual({});

    writeLocal('theme-mode', 'light', undefined);
    writeLocal('notificationPreferences', { sound: true }, undefined);
    // Older builds saved other fields, and lacked the reminder
    writeLocal('inactivitySettings', { enabled: true, thresholdMinutes: 20, warningMinutes: 2 }, undefined);
    writeLocal('automaticBackupConfig', { ...BACKUPS, lastBackupTime: '2026-11-01T00:00:00.000Z' }, undefined);

    expect(readDeviceSettings()).toEqual({
      theme: 'light',
      notifications: { sound: true },
      inactivity: { enabled: true, thresholdMinutes: 20, longRunHours: 4 },
      backups: BACKUPS,
    });
  });

  it("skip one that doesn't read", () => {
    writeLocal('theme-mode', 'sepia', undefined);
    writeLocal('inactivitySettings', { enabled: 'yes' }, undefined);
    expect(readDeviceSettings()).toEqual({});
    expect(DeviceSettingsSchema.parse({ backups: { ...BACKUPS, maxBackups: 0 }, notifications: 'loud' })).toEqual({});
  });

  it("replace this device's in an exact restore, keeping when it last backed up", () => {
    writeLocal('theme-mode', 'dark', undefined);
    writeLocal('automaticBackupConfig', { ...BACKUPS, enabled: false, lastBackupTime: 'then' }, undefined);

    applyDeviceSettings({
      theme: 'light',
      notifications: { sound: true, dailySummaryTime: 'never' },
      inactivity: { enabled: true, thresholdMinutes: 5, longRunHours: 2 },
      backups: BACKUPS,
    });

    expect(readLocal('theme-mode', null)).toBe('light');
    // Made whole, as the app reads them
    expect(readLocal('notificationPreferences', null)).toMatchObject({ sound: true, dailySummaryTime: '18:00' });
    expect(readLocal('inactivitySettings', null)).toEqual({ enabled: true, thresholdMinutes: 5, longRunHours: 2 });
    expect(readLocal('automaticBackupConfig', null)).toEqual({ ...BACKUPS, lastBackupTime: 'then' });
  });

  it('leave the ones a file lacks as they are', () => {
    writeLocal('theme-mode', 'dark', undefined);
    applyDeviceSettings(undefined);
    applyDeviceSettings({ backups: BACKUPS });

    expect(readLocal('theme-mode', null)).toBe('dark');
    expect(readLocal('notificationPreferences', null)).toBeNull();
    // No backup made on this device yet
    expect(readLocal('automaticBackupConfig', null)).toEqual(BACKUPS);
  });
});
