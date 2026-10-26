/**
 * Idle Return Hook
 *
 * The client side of idle detection (the monitor runs in the shell, where
 * the platform has one): sends the saved detection settings at startup, and
 * holds the "you were away" question the shell raises when input returns
 * after an idle pause. Used once, in App.
 */

import { useCallback, useEffect, useState } from 'react';
import { IdleChoice, IdlePause } from '../types/timer';
import { getBackend, useBackendEvent } from '../backend';
import { BACKEND_EVENTS } from '../constants/events';
import { sendIdleSettings, useEnhancedTimerSettings } from './useEnhancedTimerSettings';
import { errorMessage } from '../utils/errors';

export interface UseIdleReturnResult {
  /** The pending question, once the user is back; null otherwise. */
  pending: IdlePause | null;
  resolve: (choice: IdleChoice) => Promise<void>;
  isResolving: boolean;
  error: string | null;
}

export function useIdleReturn(): UseIdleReturnResult {
  const { inactivitySettings } = useEnhancedTimerSettings();
  const [pending, setPending] = useState<IdlePause | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The backend starts disabled; give it the saved settings. (Changes made in
  // Settings are sent from there as they're saved.)
  useEffect(() => {
    void sendIdleSettings(inactivitySettings);
  }, [inactivitySettings]);

  useBackendEvent<IdlePause>(BACKEND_EVENTS.IDLE_RETURNED, pause => {
    setError(null);
    setPending(pause);
  });
  useBackendEvent(BACKEND_EVENTS.IDLE_RESOLVED, () => {
    setPending(null);
    setError(null);
  });

  // A question raised before the listeners existed (e.g. a reload)
  useEffect(() => {
    const idle = getBackend().platform.idle;
    if (!idle) return;
    let cancelled = false;
    idle.getPending().then(
      existing => {
        if (!cancelled && existing?.returned) setPending(existing);
      },
      error => console.warn('Failed to read a pending idle pause:', error)
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const resolve = useCallback(async (choice: IdleChoice) => {
    setIsResolving(true);
    setError(null);
    try {
      // Only raised where the platform detects idle time
      await getBackend().platform.idle!.resolve(choice);
      setPending(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't apply that choice"));
    } finally {
      setIsResolving(false);
    }
  }, []);

  return { pending, resolve, isResolving, error };
}
