/**
 * State kept in an app record (see services/appRecords), with
 * useLocalStorage's API: [value, setValue]. In the desktop app it reads and
 * writes appdata.json through the records cache; outside the app it is
 * useLocalStorage.
 */

import { useCallback, useRef, useState } from 'react';
import { AppRecordKey, appRecordsActive, readAppRecord, writeAppRecord } from '../services/appRecords';
import { useLocalStorage } from './useLocalStorage';

export function useAppRecord<T>(
  key: AppRecordKey,
  initialValue: T
): readonly [T, (value: T | ((previous: T) => T)) => void] {
  // Always called (hooks can't be conditional); used outside the app
  const local = useLocalStorage<T>(key, initialValue);

  const active = appRecordsActive();
  const [value, setValue] = useState<T>(() => {
    if (!active) return initialValue;
    const stored = readAppRecord(key);
    return stored === undefined ? initialValue : (stored as T);
  });
  // Functional updates build on the latest value, not a stale render's
  const latest = useRef(value);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved = next instanceof Function ? next(latest.current) : next;
      latest.current = resolved;
      setValue(resolved);
      writeAppRecord(key, resolved).catch(error => {
        console.error(`Failed to save "${key}":`, error);
      });
    },
    [key]
  );

  return active ? ([value, update] as const) : local;
}
