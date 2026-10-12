/**
 * App records: tasks, notes, note templates, the daily goal and its history.
 *
 * In the desktop app they live in appdata.json, owned by the Rust backend
 * next to sessions.json. loadAppRecords() reads them once, before the first
 * render, into this in-memory cache, so every reader stays synchronous.
 * Writes update the cache and go to the backend, in order per record. The
 * first launch moves the records in from the webview's localStorage.
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
  initialized: boolean;
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

/** A localStorage value as plain data: parsed, any {version, data} wrapper removed. */
function readLocalStorageRecord(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number' && 'data' in parsed) {
      return parsed.data;
    }
    return parsed;
  } catch {
    // Unreadable: leave it where it is rather than move garbage
    return undefined;
  }
}

/**
 * Loads the records into the cache (desktop app only). On the first launch
 * after the move, copies them over from localStorage, then removes the
 * localStorage copies so there's one source of truth. Throws if the data
 * file can't be read; nothing is written in that case.
 */
export async function loadAppRecords(): Promise<void> {
  if (!isTauriEnvironment()) return;

  let response = await invoke<AppRecordsResponse>('get_app_records');
  if (!response.initialized) {
    const fromWebview: Record<string, unknown> = {};
    for (const key of APP_RECORD_KEYS) {
      const value = readLocalStorageRecord(key);
      if (value !== undefined && value !== null) fromWebview[key] = value;
    }
    // Stores only records the file doesn't have yet, so this is safe to repeat
    response = await invoke<AppRecordsResponse>('import_app_records', { records: fromWebview });
    for (const key of Object.keys(fromWebview)) {
      window.localStorage.removeItem(key);
    }
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
