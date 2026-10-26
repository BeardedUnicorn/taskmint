/**
 * App records: tasks, notes, note templates, the daily goal and its history.
 *
 * The backend owns them (appdata.json in the desktop app). loadAppRecords()
 * reads them once, before the first render, into this in-memory cache, so
 * every reader stays synchronous. Writes update the cache and go to the
 * backend, in order per record. The desktop app also moves in records an
 * older version left in the webview's localStorage.
 */

import { APP_RECORD_KEYS, type AppRecords, type JsonValue } from '@taskmint/contracts';
import { getBackend } from '../backend/registry';

/** The backend's record keys: STORAGE_KEYS names, so an older version's localStorage copies are found. */
export { APP_RECORD_KEYS };

export type AppRecordKey = (typeof APP_RECORD_KEYS)[number];

let cache: Map<string, unknown> | null = null;
// Each record's last write, so the next one waits for it
const writeChains = new Map<string, Promise<void>>();

export function isAppRecordKey(key: string): key is AppRecordKey {
  return (APP_RECORD_KEYS as readonly string[]).includes(key);
}

/**
 * The records an older version kept in this webview's localStorage, as plain
 * data (any {version, data} wrapper removed), and the keys they came from.
 * An unreadable value is left where it is rather than moved as garbage.
 */
function readLegacyRecords(): { records: Record<string, JsonValue>; keys: string[] } {
  const records: Record<string, JsonValue> = {};
  const keys: string[] = [];
  for (const key of APP_RECORD_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) continue;
      let value = JSON.parse(raw);
      if (value && typeof value === 'object' && typeof value.version === 'number' && 'data' in value) {
        value = value.data;
      }
      keys.push(key);
      if (value !== null && value !== undefined) records[key] = value;
    } catch {
      // Unreadable: leave it
    }
  }
  return { records, keys };
}

/** Keys earlier versions kept in localStorage that nothing reads anymore. */
const RETIRED_LOCAL_KEYS = ['timeEntries', 'dashboardWidgetPrefs'];

/**
 * Removes what earlier versions left in this webview's localStorage: the
 * retired keys, and the `<key>_backup_<time>` copies an old format upgrade
 * made of the records (which now live in appdata.json, with their own .bak
 * copies) and of the retired keys.
 */
export function removeRetiredLocalKeys(): void {
  try {
    const prefixes = [...APP_RECORD_KEYS, ...RETIRED_LOCAL_KEYS].map(key => `${key}_backup_`);
    const retired: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (RETIRED_LOCAL_KEYS.includes(key) || prefixes.some(prefix => key.startsWith(prefix)))) {
        retired.push(key);
      }
    }
    retired.forEach(key => window.localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to remove retired localStorage keys:', error);
  }
}

export interface LoadOptions {
  /**
   * Move in records an older desktop version left in this webview's
   * localStorage. Only the installed desktop app does: a development build's
   * webview storage is separate from the installed app's (and often stale),
   * but appdata.json is shared, so it would mix old test data into the real
   * records.
   */
  importLegacy: boolean;
}

/**
 * Loads the records into the cache. Records still in localStorage from
 * before the move are added to the backend first (never replacing what's
 * there, with a copy kept beside it), then removed from localStorage so
 * there's one source of truth. Throws if the records can't be read or the
 * move fails; localStorage is untouched then.
 */
export async function loadAppRecords({ importLegacy }: LoadOptions): Promise<void> {
  const backend = getBackend();
  const legacy = importLegacy ? readLegacyRecords() : { records: {}, keys: [] };
  let response: AppRecords;
  if (Object.keys(legacy.records).length > 0) {
    response = await backend.call('import_app_records', { records: legacy.records });
    console.info(`Moved ${Object.keys(legacy.records).join(', ')} into appdata.json`);
  } else {
    response = await backend.call('get_app_records');
  }
  for (const key of legacy.keys) {
    window.localStorage.removeItem(key);
  }
  if (importLegacy) removeRetiredLocalKeys();
  cache = new Map(Object.entries(response.records ?? {}));
}

/** A copy of a record (undefined when there is none), so callers can't change the cache. */
export function readAppRecord(key: AppRecordKey): unknown {
  if (!cache) throw new Error('App records are not loaded');
  const value = cache.get(key);
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * Saves a record (null or undefined removes it). The cache changes at once;
 * the backend write follows the record's earlier writes. If it fails, the
 * previous value comes back (unless a newer write replaced it) and the
 * returned promise rejects.
 */
export function writeAppRecord(key: AppRecordKey, value: unknown): Promise<void> {
  if (!cache) throw new Error('App records are not loaded');
  const records = cache;
  const previous = records.get(key);
  const stored = value === undefined || value === null ? null : structuredClone(value);
  if (stored === null) records.delete(key);
  else records.set(key, stored);

  const write = (writeChains.get(key) ?? Promise.resolve())
    // Records are plain data (validated by their readers), so they're JSON
    .then(() => getBackend().call('set_app_record', { key, value: stored as JsonValue }))
    .then(
      () => undefined,
      (error: unknown) => {
        if ((records.get(key) ?? null) === stored) {
          if (previous === undefined) records.delete(key);
          else records.set(key, previous);
        }
        throw error;
      }
    );
  // The chain itself never rejects: one failed write doesn't block the next
  writeChains.set(
    key,
    write.catch(() => undefined)
  );
  return write;
}

/** Waits for every pending write (e.g. before the app reloads). */
export async function flushAppRecords(): Promise<void> {
  await Promise.all([...writeChains.values()]);
}

/** Tests only: the given records as if just loaded, or (null) back to unloaded. */
export function resetAppRecordsForTests(records: Record<string, unknown> | null = null): void {
  cache = records === null ? null : new Map(Object.entries(structuredClone(records)));
  writeChains.clear();
}
