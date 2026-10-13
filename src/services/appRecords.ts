/**
 * App records: tasks, notes, note templates, the daily goal and its history.
 *
 * In the desktop app they live in appdata.json, owned by the Rust backend
 * next to sessions.json. loadAppRecords() reads them once, before the first
 * render, into this in-memory cache, so every reader stays synchronous.
 * Writes update the cache and go to the backend, in order per record.
 * Records an older version left in the webview's localStorage are moved in
 * at startup.
 *
 * Outside the app (the web preview, tests) the cache stays inactive and
 * callers keep using localStorage.
 */

import { invoke } from '@tauri-apps/api/core';
import { STORAGE_KEYS } from '../constants';
import { isTauriEnvironment } from '../utils/tauri';

/** Paired with APP_RECORD_KEYS in src-tauri/src/storage.rs. */
export const APP_RECORD_KEYS = [
  STORAGE_KEYS.PREDEFINED_TASKS,
  STORAGE_KEYS.TASK_NOTES,
  STORAGE_KEYS.NOTE_TEMPLATES,
  STORAGE_KEYS.DAILY_GOAL,
  STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS,
] as const;

export type AppRecordKey = (typeof APP_RECORD_KEYS)[number];

interface AppRecordsResponse {
  records: Record<string, unknown>;
}

let cache: Map<string, unknown> | null = null;
// Each record's last write, so the next one waits for it
const writeChains = new Map<string, Promise<void>>();

export function isAppRecordKey(key: string): key is AppRecordKey {
  return (APP_RECORD_KEYS as readonly string[]).includes(key);
}

/** True once the records are loaded from the app's data file. */
export function appRecordsActive(): boolean {
  return cache !== null;
}

/**
 * The records an older version kept in this webview's localStorage, as plain
 * data (any {version, data} wrapper removed), and the keys they came from.
 * An unreadable value is left where it is rather than moved as garbage.
 */
function readLegacyRecords(): { records: Record<string, unknown>; keys: string[] } {
  const records: Record<string, unknown> = {};
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

interface LoadOptions {
  /**
   * Move in records left in this webview's localStorage. Off in development
   * builds: their webview storage is separate from the installed app's (and
   * often stale), but appdata.json is shared, so they'd mix old test data
   * into the real records.
   */
  importLegacy?: boolean;
}

/**
 * Loads the records into the cache (desktop app only). Records still in
 * localStorage from before the move are added to the file first (never
 * replacing what's there, with a copy kept beside it), then removed from
 * localStorage so there's one source of truth. Throws if the data file
 * can't be read or the move fails; localStorage is untouched then.
 */
export async function loadAppRecords({ importLegacy = !import.meta.env.DEV }: LoadOptions = {}): Promise<void> {
  if (!isTauriEnvironment()) return;

  const legacy = importLegacy ? readLegacyRecords() : { records: {}, keys: [] };
  let response: AppRecordsResponse;
  if (Object.keys(legacy.records).length > 0) {
    response = await invoke<AppRecordsResponse>('import_app_records', { records: legacy.records });
    console.info(`Moved ${Object.keys(legacy.records).join(', ')} into appdata.json`);
  } else {
    response = await invoke<AppRecordsResponse>('get_app_records');
  }
  for (const key of legacy.keys) {
    window.localStorage.removeItem(key);
  }
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
    .then(() => invoke('set_app_record', { key, value: stored }))
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

/** Tests only: back to the unloaded state. */
export function resetAppRecordsForTests(): void {
  cache = null;
  writeChains.clear();
}
