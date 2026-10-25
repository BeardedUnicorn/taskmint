import { useEffect, useRef } from 'react';
import { listen, type Event } from '@tauri-apps/api/event';

/**
 * Listens to one or more backend events while mounted (and `enabled`). The
 * latest handler always runs, so callers needn't memoize it, and listeners
 * register once per event list. Unmounting before registration finishes still
 * removes the listener. Outside the desktop app `listen` rejects; that's
 * ignored.
 */
export function useTauriEvent<T = unknown>(
  events: string | readonly string[],
  handler: (event: Event<T>) => void,
  options: { enabled?: boolean } = {}
): void {
  const { enabled = true } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const key = typeof events === 'string' ? events : events.join('\n');
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    for (const name of key.split('\n')) {
      listen<T>(name, event => handlerRef.current(event))
        .then(unlisten => {
          if (disposed) unlisten();
          else unlisteners.push(unlisten);
        })
        .catch(() => {
          // Not in the desktop app: no backend events to hear
        });
    }
    return () => {
      disposed = true;
      unlisteners.forEach(unlisten => unlisten());
    };
  }, [key, enabled]);
}
