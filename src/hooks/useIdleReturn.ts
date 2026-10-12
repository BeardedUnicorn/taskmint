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
import { isTauriEnvironment, safeInvoke, safeListen } from '../utils/tauri';
import { sendIdleSettings, useEnhancedTimerSettings } from './useEnhancedTimerSettings';

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

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const keep = (unlisten: (() => void) | null) => {
      if (!unlisten) return;
      if (cancelled) unlisten();
      else unlisteners.push(unlisten);
    };

    safeListen('idle-returned', event => {
      setError(null);
      setPending(event.payload as IdlePause);
    }).then(keep);
    safeListen('idle-resolved', () => {
      setPending(null);
      setError(null);
    }).then(keep);

    // A question raised before this listener existed (e.g. a reload)
    safeInvoke<IdlePause | null>('get_idle_pause').then(existing => {
      if (!cancelled && existing?.returned) setPending(existing);
    });

    return () => {
      cancelled = true;
      unlisteners.forEach(unlisten => unlisten());
    };
  }, []);

  const resolve = useCallback(async (choice: IdleChoice) => {
    setIsResolving(true);
    setError(null);
    try {
      await invoke('resolve_idle_pause', { choice });
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsResolving(false);
    }
  }, []);

  return { pending, resolve, isResolving, error };
}
