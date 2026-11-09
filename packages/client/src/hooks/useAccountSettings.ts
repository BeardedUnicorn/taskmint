/**
 * The account settings record (types/accountSettings) as shared state:
 * every component reading it sees the same value, a save shows everywhere at
 * once, and so does a change made on another device or tab. A save the
 * schema refuses is never made.
 */

import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../constants';
import { readAppRecord, subscribeToAppRecords, writeAppRecord } from '../services/appRecords';
import { AccountSettings, AccountSettingsSchema, parseAccountSettings } from '../types/accountSettings';
import { createStorageError } from '../types/errors';

const KEY = STORAGE_KEYS.ACCOUNT_SETTINGS;

const listeners = new Set<() => void>();
// The last snapshot, by the record's JSON, so a read keeps its identity
let snapshot: { raw: string; value: AccountSettings } | null = null;

function tell(): void {
  listeners.forEach(listener => listener());
}

/** The settings as stored now (the defaults for any not saved). */
export function readAccountSettings(): AccountSettings {
  const raw = JSON.stringify(readAppRecord(KEY) ?? null);
  if (snapshot?.raw !== raw) snapshot = { raw, value: parseAccountSettings(JSON.parse(raw)) };
  return snapshot.value;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const stop = subscribeToAppRecords(change => {
    if (change.keys.includes(KEY)) listener();
  });
  return () => {
    listeners.delete(listener);
    stop();
  };
}

/**
 * Saves `updates` over the current settings. Rejects, saving nothing, when
 * the result isn't valid; a failed save puts the previous value back.
 */
export async function updateAccountSettings(updates: Partial<AccountSettings>): Promise<void> {
  const checked = AccountSettingsSchema.safeParse({ ...readAccountSettings(), ...updates });
  if (!checked.success) {
    throw createStorageError('STORAGE_VALIDATION_FAILED', `Data validation failed for key "${KEY}"`, {
      key: KEY,
      validationError: checked.error.message,
    });
  }
  const saving = writeAppRecord(KEY, checked.data);
  tell();
  try {
    await saving;
  } finally {
    // A failed save has put the previous value back
    tell();
  }
}

export function useAccountSettings(): readonly [AccountSettings, typeof updateAccountSettings] {
  const settings = useSyncExternalStore(subscribe, readAccountSettings, readAccountSettings);
  return [settings, updateAccountSettings] as const;
}
