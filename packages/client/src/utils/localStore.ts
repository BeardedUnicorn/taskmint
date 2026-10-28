/**
 * localStorage values as a small external store: reads are cached per key
 * (re-parsed only when the stored string changes, so a value keeps its
 * identity between reads), writes resolve updaters against the latest stored
 * value rather than a render's copy, and every subscriber of a key hears about
 * a write. useLocalStorage is built on it, so two components using the same
 * key always agree.
 *
 * Values are stored in the versioned envelope `{ version, data, migratedAt }`;
 * older unversioned values are migrated (with a backup) on first read.
 */

import { migrateData, createBackup, needsMigration, type VersionedData } from './dataMigration';

type Listener = () => void;

const cache = new Map<string, { raw: string | null; value: unknown }>();
const listeners = new Map<string, Set<Listener>>();

function parseStored(key: string, raw: string): { raw: string; value: unknown } {
  const parsed = JSON.parse(raw);
  if (parsed === null) return { raw, value: null };
  if (needsMigration(parsed)) {
    createBackup(key, parsed);
    const migrated: VersionedData = migrateData(key, parsed);
    const migratedRaw = JSON.stringify(migrated);
    window.localStorage.setItem(key, migratedRaw);
    return { raw: migratedRaw, value: migrated.data };
  }
  return { raw, value: parsed.data };
}

/** The stored value for `key`, or `initial` when there is none or it can't be read. */
export function readLocal<T>(key: string, initial: T): T {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch (error) {
    console.error(`Error reading localStorage key "${key}":`, error);
    return initial;
  }
  if (raw === null) return initial;

  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  try {
    const entry = parseStored(key, raw);
    cache.set(key, entry);
    return entry.value as T;
  } catch (error) {
    console.error(`Error reading localStorage key "${key}":`, error);
    return initial;
  }
}

/**
 * Store a value (or an updater applied to the latest stored value) and tell
 * the key's subscribers. A failed write is logged and leaves the value as it
 * was.
 */
export function writeLocal<T>(key: string, next: T | ((previous: T) => T), initial: T): void {
  try {
    const value = next instanceof Function ? next(readLocal(key, initial)) : next;
    const raw = JSON.stringify({ version: 1, data: value, migratedAt: new Date().toISOString() });
    window.localStorage.setItem(key, raw);
    cache.set(key, { raw, value });
  } catch (error) {
    console.error(`Error saving to localStorage key "${key}":`, error);
    return;
  }
  notify(key);
}

/** Calls `listener` after every write to `key` (from this window or another). */
export function subscribeLocal(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

function notify(key: string): void {
  listeners.get(key)?.forEach(listener => listener());
}

// Writes from other windows
window.addEventListener('storage', event => {
  if (event.key === null) {
    // clear(): every key may have changed
    listeners.forEach((_, key) => notify(key));
  } else {
    notify(event.key);
  }
});
