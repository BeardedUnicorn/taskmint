/**
 * One-time move: funds-release days and the withdrawal interval were
 * each device's own settings in localStorage before the accountSettings
 * record. Self-contained, to retire with the other one-time moves once no
 * device has the old keys left.
 */

import { STORAGE_KEYS } from '../constants';
import { parseAccountSettings } from '../types/accountSettings';
import { readLocal } from '../utils/localStore';
import { RECORD_CONFLICT, readAppRecord, writeAppRecord } from './appRecords';

/** Where each setting was kept on a device. */
const LOCAL_KEYS = {
  fundsReleaseDays: STORAGE_KEYS.FUNDS_RELEASE_DAYS,
  withdrawalIntervalDays: STORAGE_KEYS.WITHDRAWAL_INTERVAL_DAYS,
} as const;

/**
 * Once the records are loaded: moves this device's values into the record
 * when it isn't set yet (a value that can't be read takes the default), then
 * removes the device's copies. A record set elsewhere in the meantime stays;
 * a save that fails leaves the copies for the next launch. Skipped in a
 * development build (its webview storage isn't the installed app's, but the
 * data folder is shared).
 */
export async function moveLocalAccountSettings(): Promise<void> {
  if (import.meta.env.DEV) return;
  const stored = Object.entries(LOCAL_KEYS).filter(([, key]) => window.localStorage.getItem(key) !== null);
  if (stored.length === 0) return;
  if (readAppRecord(STORAGE_KEYS.ACCOUNT_SETTINGS) === undefined) {
    const values = Object.fromEntries(stored.map(([field, key]) => [field, readLocal<unknown>(key, undefined)]));
    try {
      await writeAppRecord(STORAGE_KEYS.ACCOUNT_SETTINGS, parseAccountSettings(values));
      console.info('Moved the payout settings into the accountSettings record');
    } catch (error) {
      if (error !== RECORD_CONFLICT) {
        console.error('Failed to move the payout settings into their record:', error);
        return;
      }
    }
  }
  for (const key of Object.values(LOCAL_KEYS)) window.localStorage.removeItem(key);
}
