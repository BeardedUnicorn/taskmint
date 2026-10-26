/**
 * State kept in an app record (see services/appRecords), with
 * useLocalStorage's API: [value, setValue]. It reads and writes the backend's
 * records through the records cache.
 */

import { useCallback, useRef, useState } from 'react';
import { AppRecordKey, readAppRecord, writeAppRecord } from '../services/appRecords';

export function useAppRecord<T>(
  key: AppRecordKey,
  initialValue: T
): readonly [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
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

  return [value, update] as const;
}
