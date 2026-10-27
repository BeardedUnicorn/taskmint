import { useEffect, useRef } from 'react';
import { subscribeToAppRecords, type AppRecordKey, type RecordsChange } from '../services/appRecords';

/**
 * Calls `onChange` while mounted whenever any of `keys` is replaced with a
 * version saved elsewhere (another tab or device), so state read from the
 * records can read them again. The latest handler always runs.
 */
export function useAppRecordsChanged(keys: readonly AppRecordKey[], onChange: (change: RecordsChange) => void): void {
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  });

  const watched = keys.join('\n');
  useEffect(
    () =>
      subscribeToAppRecords(change => {
        if (change.keys.some(key => watched.split('\n').includes(key))) handlerRef.current(change);
      }),
    [watched]
  );
}
