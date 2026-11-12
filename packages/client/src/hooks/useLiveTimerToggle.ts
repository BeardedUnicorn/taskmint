import { useCallback } from 'react';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { TimerState } from '../types/timer';
import { mostRecentlyPaused } from '../utils/timerHelpers';

/**
 * Pauses the running timer, or resumes the one paused last (⇧⌘P), as the
 * palette's and the tray's Pause and Resume do. Nothing without either.
 */
export function useLiveTimerToggle(): () => void {
  const { activeSession, pauseTimerInstance, resumeTimerInstance } = useSessionManagementContext();
  return useCallback(() => {
    if (!activeSession) return;
    const running = activeSession.timerInstances.find(instance => instance.state === TimerState.running);
    if (running) {
      void pauseTimerInstance(running.id);
      return;
    }
    const paused = mostRecentlyPaused(activeSession);
    if (paused) void resumeTimerInstance(paused.id);
  }, [activeSession, pauseTimerInstance, resumeTimerInstance]);
}
