/**
 * This device's own settings (appearance, notifications, idle detection and
 * the long-run reminder, automatic backups), as a backup file carries them.
 * They stay in this device's localStorage: a merge import leaves them as
 * they are, and an exact restore puts the file's in their place.
 */

import { z } from 'zod';
import { INACTIVITY_CONSTANTS, STORAGE_KEYS } from '../constants';
import { NOTIFICATION_PREFERENCES_KEY, parseNotificationPreferences } from '../notifications/preferences';
import { DEFAULT_INACTIVITY_SETTINGS } from '../types/timer';
import { readLocal, writeLocal } from './localStore';

const ThemeSchema = z.enum(['light', 'dark', 'system']);

/** Settings older builds saved lack the newer fields, which take their defaults. */
const InactivitySchema = z.object({
  enabled: z.boolean().default(DEFAULT_INACTIVITY_SETTINGS.enabled),
  thresholdMinutes: z
    .number()
    .int()
    .min(INACTIVITY_CONSTANTS.MIN_THRESHOLD_MINUTES)
    .max(INACTIVITY_CONSTANTS.MAX_THRESHOLD_MINUTES)
    .default(DEFAULT_INACTIVITY_SETTINGS.thresholdMinutes),
  longRunHours: z.number().int().min(0).default(DEFAULT_INACTIVITY_SETTINGS.longRunHours),
});

/** The backup settings, without when this device last backed up. */
const BackupsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  backupPath: z.string(),
  maxBackups: z.number().int().min(1).max(100),
});

/**
 * A backup file's `settings`: each one only if this device had saved it,
 * and one that doesn't read is skipped rather than failing the file.
 */
export const DeviceSettingsSchema = z.object({
  theme: ThemeSchema.optional().catch(undefined),
  notifications: z.record(z.string(), z.unknown()).optional().catch(undefined),
  inactivity: InactivitySchema.optional().catch(undefined),
  backups: BackupsSchema.optional().catch(undefined),
});

export type DeviceSettings = z.infer<typeof DeviceSettingsSchema>;

/** Where each setting is kept on a device. */
const KEYS = {
  theme: STORAGE_KEYS.THEME_MODE,
  notifications: NOTIFICATION_PREFERENCES_KEY,
  inactivity: STORAGE_KEYS.INACTIVITY_SETTINGS,
  backups: STORAGE_KEYS.BACKUP_CONFIG,
} as const;

/** This device's saved settings, for a backup file (a setting never saved is left out). */
export function readDeviceSettings(): DeviceSettings {
  const saved = Object.fromEntries(
    Object.entries(KEYS).map(([name, key]) => [name, readLocal<unknown>(key, undefined)])
  );
  return DeviceSettingsSchema.parse(saved);
}

/**
 * Puts a backup's settings in place of this device's (an exact restore).
 * A setting the file doesn't have stays as it is, and so does when this
 * device last backed up. Takes effect when the app reloads.
 */
export function applyDeviceSettings(settings: DeviceSettings | undefined): void {
  if (!settings) return;
  const { theme, notifications, inactivity, backups } = settings;
  if (theme) writeLocal(KEYS.theme, theme, undefined);
  if (notifications) writeLocal(KEYS.notifications, parseNotificationPreferences(notifications), undefined);
  if (inactivity) writeLocal(KEYS.inactivity, inactivity, undefined);
  if (backups) {
    const current = readLocal<{ lastBackupTime?: unknown } | undefined>(KEYS.backups, undefined);
    const lastBackupTime = current?.lastBackupTime;
    writeLocal(KEYS.backups, lastBackupTime === undefined ? backups : { ...backups, lastBackupTime }, undefined);
  }
}
