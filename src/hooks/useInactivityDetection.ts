/**
 * Inactivity Detection Hook
 *
 * Monitors user activity and automatically pauses timers when inactivity is
 * detected. Provides configurable thresholds and warning systems.
 *
 * Activity tracking lives in refs: DOM activity events (mousemove etc.) fire
 * constantly, and pushing each one through React state would re-render the
 * consumer and re-register every listener on each mouse move. State is only
 * touched on real transitions (warning shown/cleared, paused, user returns).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { seedInactivitySettingsFromLegacyEnhanced } from './useEnhancedTimerSettings';
import { STORAGE_KEYS, INACTIVITY_CONSTANTS } from '../constants';
import {
  InactivitySettings,
  TimerActivityState,
  DEFAULT_INACTIVITY_SETTINGS,
  UseInactivityDetectionReturn
} from '../types/timer';

// Helper function to get effective threshold in testing mode
function getEffectiveThresholdMinutes(normalThreshold: number): number {
  switch (normalThreshold) {
    case 15: return 1;  // 15 minutes -> 1 minute
    case 30: return 2;  // 30 minutes -> 2 minutes
    case 60: return 3;  // 60 minutes -> 3 minutes
    default: return Math.max(1, Math.floor(normalThreshold / 10)); // Divide by 10, minimum 1 minute
  }
}

// Helper function to get effective warning duration in testing mode
function getEffectiveWarningDuration(normalDuration: number): number {
  return Math.max(5, Math.floor(normalDuration / 3)); // Divide by 3, minimum 5 seconds
}

export function useInactivityDetection(): UseInactivityDetectionReturn {
  // Settings stored in localStorage (seed once from the legacy nested blob
  // so values configured through the old Settings path are honored)
  seedInactivitySettingsFromLegacyEnhanced();
  const [settings, setSettings] = useLocalStorage<InactivitySettings>(
    STORAGE_KEYS.INACTIVITY_SETTINGS,
    DEFAULT_INACTIVITY_SETTINGS
  );

  // Activity state (UI-visible transitions only)
  const [activityState, setActivityState] = useState<TimerActivityState>({
    lastActivityTime: new Date(),
    isUserActive: true,
    inactivityWarningShown: false,
    pausedDueToInactivity: false,
  });

  // Warning state
  const [isWarningShown, setIsWarningShown] = useState(false);
  const [warningTimeRemaining, setWarningTimeRemaining] = useState(0);

  // Refs: high-frequency tracking that must not trigger renders
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef(false);
  const pausedDueToInactivityRef = useRef(false);
  const isDetectionActive = useRef(true);
  const warningCountdown = useRef<NodeJS.Timeout>();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const clearWarning = useCallback(() => {
    if (warningCountdown.current) {
      clearInterval(warningCountdown.current);
      warningCountdown.current = undefined;
    }
    if (warningShownRef.current) {
      warningShownRef.current = false;
      setIsWarningShown(false);
      setWarningTimeRemaining(0);
    }
  }, []);

  // Activity event handler: cheap ref update on every event; state updates
  // only when the user returns from a warning/paused state.
  const handleActivity = useCallback(() => {
    if (!isDetectionActive.current) return;

    lastActivityRef.current = Date.now();

    const wasWarning = warningShownRef.current;
    const wasPaused = pausedDueToInactivityRef.current;
    if (wasWarning) clearWarning();

    if (wasWarning || wasPaused) {
      pausedDueToInactivityRef.current = false;
      setActivityState(prev => ({
        ...prev,
        lastActivityTime: new Date(),
        isUserActive: true,
        inactivityWarningShown: false,
        pausedDueToInactivity: false,
      }));
    }

    // resumeOnActivity: the user is back after an automatic pause — tell the
    // session layer to resume the timers that pause suspended.
    if (wasPaused && settingsRef.current.resumeOnActivity) {
      window.dispatchEvent(new CustomEvent('timer-resume-activity', {
        detail: { reason: 'activity-detected', timestamp: new Date() }
      }));
    }
  }, [clearWarning]);

  // Pause timer due to inactivity
  const pauseTimerDueToInactivity = useCallback(() => {
    pausedDueToInactivityRef.current = true;
    clearWarning();
    setActivityState(prev => ({
      ...prev,
      isUserActive: false,
      pausedDueToInactivity: true,
    }));

    // The session layer listens for this on the window event bus
    window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
      detail: { reason: 'inactivity', timestamp: new Date() }
    }));
  }, [clearWarning]);

  // Periodic inactivity check. Once the warning is up, its countdown owns the
  // auto-pause; once paused, nothing re-fires until activity resets the flag.
  const checkInactivity = useCallback(() => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.enabled || !isDetectionActive.current) return;
    if (pausedDueToInactivityRef.current || warningShownRef.current) return;

    const timeSinceLastActivity = Date.now() - lastActivityRef.current;
    const effectiveThresholdMinutes = currentSettings.testingMode
      ? getEffectiveThresholdMinutes(currentSettings.thresholdMinutes)
      : currentSettings.thresholdMinutes;
    const inactivityThreshold = effectiveThresholdMinutes * 60 * 1000;

    if (timeSinceLastActivity < inactivityThreshold) return;

    if (!currentSettings.showWarningBeforePause) {
      pauseTimerDueToInactivity();
      return;
    }

    // Show the warning and start its countdown
    warningShownRef.current = true;
    setActivityState(prev => ({
      ...prev,
      isUserActive: false,
      inactivityWarningShown: true,
    }));
    setIsWarningShown(true);

    const effectiveWarningDuration = currentSettings.testingMode
      ? getEffectiveWarningDuration(currentSettings.warningDurationSeconds)
      : currentSettings.warningDurationSeconds;
    setWarningTimeRemaining(effectiveWarningDuration);

    let remainingTime = effectiveWarningDuration;
    warningCountdown.current = setInterval(() => {
      remainingTime -= 1;
      setWarningTimeRemaining(remainingTime);

      if (remainingTime <= 0) {
        pauseTimerDueToInactivity();
      }
    }, 1000);
  }, [pauseTimerDueToInactivity]);

  // Update settings
  const updateSettings = useCallback(async (newSettings: Partial<InactivitySettings>) => {
    setSettings({ ...settingsRef.current, ...newSettings });
  }, [setSettings]);

  // Reset activity (for manual calls)
  const resetActivity = useCallback(() => {
    handleActivity();
  }, [handleActivity]);

  // Pause detection
  const pauseDetection = useCallback(() => {
    isDetectionActive.current = false;
    clearWarning();
  }, [clearWarning]);

  // Resume detection
  const resumeDetection = useCallback(() => {
    isDetectionActive.current = true;
    lastActivityRef.current = Date.now();
  }, []);

  // Attach listeners and the periodic check once (per enabled toggle).
  useEffect(() => {
    if (!settings.enabled) return;

    INACTIVITY_CONSTANTS.ACTIVITY_EVENTS.forEach(eventType => {
      document.addEventListener(eventType, handleActivity, { passive: true });
    });

    const checkInterval = setInterval(
      checkInactivity,
      INACTIVITY_CONSTANTS.ACTIVITY_CHECK_INTERVAL_MS
    );

    return () => {
      INACTIVITY_CONSTANTS.ACTIVITY_EVENTS.forEach(eventType => {
        document.removeEventListener(eventType, handleActivity);
      });
      clearInterval(checkInterval);
      if (warningCountdown.current) {
        clearInterval(warningCountdown.current);
        warningCountdown.current = undefined;
      }
    };
  }, [settings.enabled, handleActivity, checkInactivity]);

  return {
    isActive: isDetectionActive.current,
    settings,
    activityState,
    updateSettings,
    resetActivity,
    pauseDetection,
    resumeDetection,
    isWarningShown,
    warningTimeRemaining,
  };
}
