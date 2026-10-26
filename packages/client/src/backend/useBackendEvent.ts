import { useEffect, useRef } from 'react';
import type { EventName } from '@taskmint/contracts';
import { getBackend } from './registry';

/**
 * Listens to one or more backend events while mounted. The latest handler
 * always runs, so callers needn't memoize it, and listeners register once
 * per event list.
 */
export function useBackendEvent<T = unknown>(
  events: EventName | readonly EventName[],
  handler: (payload: T) => void
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const key = typeof events === 'string' ? events : events.join('\n');
  useEffect(() => {
    const backend = getBackend();
    const unsubscribes = key
      .split('\n')
      .map(name => backend.subscribe<T>(name as EventName, payload => handlerRef.current(payload)));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [key]);
}
