/**
 * Idle Return Hook
 *
 * The app side of idle detection (the monitor runs in the backend): sends the
 * saved detection settings at startup, and holds the "you were away" question
 * the backend raises when input returns after an idle pause. Used once, in
 * App.
 */

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IdleChoice, IdlePause } from '../types/timer';
import { isTauriEnvironment, safeInvoke } from '../utils/tauri';
import { useTauriEvent } from './useTauriEvent';
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

  useTauriEvent<IdlePause>('idle-returned', event => {
    setError(null);
    setPending(event.payload);
  });
  useTauriEvent('idle-resolved', () => {
    setPending(null);
    setError(null);
  });

  // A question raised before the listeners existed (e.g. a reload)
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let cancelled = false;
    safeInvoke<IdlePause | null>('get_idle_pause').then(existing => {
      if (!cancelled && existing?.returned) setPending(existing);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolve = useCallback(async (choice: IdleChoice) => {
    setIsResolving(true);
    setError(null);
    try {
      await invoke('resolve_idle_pause', { choice });
      setPending(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't apply that choice"));
    } finally {
      setIsResolving(false);
    }
  }, []);

  return { pending, resolve, isResolving, error };
}
