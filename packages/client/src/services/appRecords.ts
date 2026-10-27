/**
 * App records: tasks, notes, note templates, the daily goal and its history.
 *
 * The backend owns them (appdata.json in the desktop app, the server's
 * database on the web). loadAppRecords() reads them once, before the first
 * render, into this in-memory cache, so every reader stays synchronous.
 * Writes update the cache and go to the backend, in order per record, each
 * based on the record's revision; a change made elsewhere (another tab or
 * device) replaces the cached record and tells subscribeToAppRecords'
 * listeners. The desktop app also moves in records an older version left in
 * the webview's localStorage.
 */

import { APP_RECORD_KEYS, CORE_ERRORS, EVENTS, type AppRecords, type JsonValue } from '@taskmint/contracts';
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
 * move fails; localStorage is untouched then. From then on the cache follows
 * changes made elsewhere (another tab or device).
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
  cache = new Map(Object.entries(response.records));
  revisions = new Map(Object.entries(response.revisions));
  stopFollowing?.();
  stopFollowing = followChangesElsewhere();
}

/** A copy of a record (undefined when there is none), so callers can't change the cache. */
export function readAppRecord(key: AppRecordKey): unknown {
  if (!cache) throw new Error('App records are not loaded');
  const value = cache.get(key);
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * A save was refused because the record changed elsewhere since this tab
 * read it. The cache then holds that newer version, and the save's promise
 * rejects with this.
 */
export const RECORD_CONFLICT = CORE_ERRORS.RECORD_CONFLICT;

/** Records the cache replaced with a version from elsewhere. */
export interface RecordsChange {
  keys: AppRecordKey[];
  /** A save from this tab was refused for it (RECORD_CONFLICT). */
  conflict: boolean;
}

type RecordsListener = (change: RecordsChange) => void;

// Each record's revision as last read or saved: the next save's base
let revisions = new Map<string, number>();
// Saves of each record not yet settled. Another device's change to the
// record waits for them: a stale one fails on its revision, and the cache
// then reads the record again.
const unsettled = new Map<string, number>();
// How often each record was replaced from elsewhere: a save queued before
// that would write over the newer version, so it's dropped.
const replacements = new Map<string, number>();
const listeners = new Set<RecordsListener>();
let stopFollowing: (() => void) | null = null;

const SUPERSEDED = Symbol('superseded');

/** Calls `listener` whenever records are replaced with a version from elsewhere. */
export function subscribeToAppRecords(listener: RecordsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(change: RecordsChange): void {
  listeners.forEach(listener => listener(change));
}

const count = (counts: Map<string, number>, key: string) => counts.get(key) ?? 0;

/** Reads `keys` from the backend again, into the cache. */
async function refresh(keys: AppRecordKey[], conflict: boolean): Promise<void> {
  const records = cache as Map<string, unknown>;
  let response: AppRecords;
  try {
    response = await getBackend().call('get_app_records');
  } catch (error) {
    console.error('Failed to read the records again:', error);
    return;
  }
  for (const key of keys) {
    const value = response.records[key];
    if (value === undefined) records.delete(key);
    else records.set(key, value);
    // Every key has a revision (0 for a record never saved)
    revisions.set(key, response.revisions[key]);
    replacements.set(key, count(replacements, key) + 1);
  }
  notify({ keys, conflict });
}

/**
 * Follows saves made elsewhere (`app-records-changed`), and reads everything
 * again when the backend says events were missed (`resync`). This tab's own
 * saves come back as events too: they're skipped, being in flight or
 * already counted.
 */
function followChangesElsewhere(): () => void {
  const backend = getBackend();
  const stopChanges = backend.subscribe<{ key: string; revision: number }>(
    EVENTS.APP_RECORDS_CHANGED,
    ({ key, revision }) => {
      if (!isAppRecordKey(key) || count(unsettled, key) > 0 || revision <= count(revisions, key)) return;
      void refresh([key], false);
    }
  );
  const stopResync = backend.subscribe(EVENTS.RESYNC, () => {
    void refresh(
      APP_RECORD_KEYS.filter(key => count(unsettled, key) === 0),
      false
    );
  });
  return () => {
    stopChanges();
    stopResync();
  };
}

/**
 * Saves a record (null or undefined removes it). The cache changes at once;
 * the backend write follows the record's earlier writes, based on the
 * revision this tab last saw. If it fails, the previous value comes back
 * (unless a newer write replaced it) and the returned promise rejects. If
 * the record changed elsewhere meanwhile, the cache takes that version and
 * the promise rejects with RECORD_CONFLICT.
 */
export function writeAppRecord(key: AppRecordKey, value: unknown): Promise<void> {
  if (!cache) throw new Error('App records are not loaded');
  const records = cache;
  const previous = records.get(key);
  const stored = value === undefined || value === null ? null : structuredClone(value);
  if (stored === null) records.delete(key);
  else records.set(key, stored);

  const replacementsSeen = count(replacements, key);
  unsettled.set(key, count(unsettled, key) + 1);
  const write = (writeChains.get(key) ?? Promise.resolve())
    .then(async () => {
      if (count(replacements, key) !== replacementsSeen) throw SUPERSEDED;
      const baseRevision = count(revisions, key);
      // Records are plain data (validated by their readers), so they're JSON
      await getBackend().call('set_app_record', { key, value: stored as JsonValue, baseRevision });
      // A save based on the current revision is the next one
      revisions.set(key, baseRevision + 1);
    })
    .then(
      () => undefined,
      async (error: unknown) => {
        if (error === SUPERSEDED) {
          notify({ keys: [key], conflict: true });
          throw RECORD_CONFLICT;
        }
        if (error === RECORD_CONFLICT) {
          await refresh([key], true);
          throw error;
        }
        if ((records.get(key) ?? null) === stored) {
          if (previous === undefined) records.delete(key);
          else records.set(key, previous);
        }
        throw error;
      }
    )
    .finally(() => unsettled.set(key, count(unsettled, key) - 1));
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
  revisions = new Map();
  unsettled.clear();
  replacements.clear();
  stopFollowing?.();
  stopFollowing = null;
}

/** Tests only: tell the listeners records changed elsewhere (or a save lost to such a change). */
export function announceAppRecordsChangeForTests(change: RecordsChange): void {
  notify(change);
}
