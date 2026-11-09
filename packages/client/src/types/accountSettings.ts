/**
 * The settings that change the numbers: how long the payment site holds
 * earnings, and how often it allows a withdrawal. They're a record (kept
 * with the data, so they sync across devices and are in exports and
 * backups); the other settings stay on each device.
 */

import { z } from 'zod';

export const DEFAULT_FUNDS_RELEASE_DAYS = 7;
export const DEFAULT_WITHDRAWAL_INTERVAL_DAYS = 3;

const days = z.number().int().min(0);

/** What a save must be. */
export const AccountSettingsSchema = z.object({
  /** How many days after a work day its earnings are released. */
  fundsReleaseDays: days,
  /**
   * How many days the payment site makes you wait between withdrawals,
   * counted to the minute (days × 24 hours from the last one).
   */
  withdrawalIntervalDays: days,
});

export type AccountSettings = z.infer<typeof AccountSettingsSchema>;

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  fundsReleaseDays: DEFAULT_FUNDS_RELEASE_DAYS,
  withdrawalIntervalDays: DEFAULT_WITHDRAWAL_INTERVAL_DAYS,
};

/** Each field falls back on its own, so one bad value doesn't reset the other. */
const StoredAccountSettingsSchema = z.object({
  fundsReleaseDays: days.catch(DEFAULT_FUNDS_RELEASE_DAYS),
  withdrawalIntervalDays: days.catch(DEFAULT_WITHDRAWAL_INTERVAL_DAYS),
});

/** A stored record made whole: none, or a field it can't read, takes the default. */
export function parseAccountSettings(value: unknown): AccountSettings {
  return StoredAccountSettingsSchema.parse(value && typeof value === 'object' ? value : {});
}
