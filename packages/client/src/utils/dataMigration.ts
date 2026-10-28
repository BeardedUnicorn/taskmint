/**
 * Versioned localStorage values: each is stored as `{ version, data,
 * migratedAt }`. A value saved before versioning (version 0) is wrapped once,
 * after a copy of it is kept under `<key>_backup_<time>` (the newest five).
 */

export const CURRENT_DATA_VERSION = 1;

/** Copies kept of each key's values from before a migration. */
const BACKUPS_KEPT = 5;

export interface VersionedData {
  version: number;
  data: any;
  migratedAt?: string;
  originalVersion?: number;
}

/** The value's version; 0 for one saved before versioning. */
export function getDataVersion(data: any): number {
  return typeof data?.version === 'number' ? data.version : 0;
}

export function needsMigration(data: any): boolean {
  return getDataVersion(data) < CURRENT_DATA_VERSION;
}

/** The value in the current shape: an unversioned one is wrapped as version 1. */
export function migrateData(_key: string, data: any): any {
  if (!needsMigration(data)) return data;
  return {
    version: CURRENT_DATA_VERSION,
    data,
    migratedAt: new Date().toISOString(),
    originalVersion: 0,
  };
}

/** Keeps a copy of `data` before it's migrated, and drops the oldest copies. */
export function createBackup(key: string, data: any): void {
  const prefix = `${key}_backup_`;
  try {
    localStorage.setItem(
      `${prefix}${Date.now()}`,
      JSON.stringify({
        originalKey: key,
        data,
        backedUpAt: new Date().toISOString(),
        version: getDataVersion(data),
      })
    );
    // Newest first: the names end in equal-length millisecond times
    const copies = Array.from({ length: localStorage.length }, (_, i) => String(localStorage.key(i)))
      .filter(name => name.startsWith(prefix))
      .sort()
      .reverse();
    for (const old of copies.slice(BACKUPS_KEPT)) {
      localStorage.removeItem(old);
    }
  } catch (error) {
    console.error(`Failed to create backup for "${key}":`, error);
  }
}
