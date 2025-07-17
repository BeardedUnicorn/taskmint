/**
 * Inactivity Detection Hook
 * 
 * Monitors user activity and automatically pauses timers when inactivity is detected.
 * Provides configurable thresholds and warning systems.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
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
  // Settings stored in localStorage
  const [settings, setSettings] = useLocalStorage<InactivitySettings>(
    STORAGE_KEYS.INACTIVITY_SETTINGS,
    DEFAULT_INACTIVITY_SETTINGS
  );

  // Activity state
  const [activityState, setActivityState] = useState<TimerActivityState>({
    lastActivityTime: new Date(),
    isUserActive: true,
    inactivityWarningShown: false,
    pausedDueToInactivity: false,
  });

  // Warning state
  const [isWarningShown, setIsWarningShown] = useState(false);
  const [warningTimeRemaining, setWarningTimeRemaining] = useState(0);

  // Refs for intervals and timeouts
  const activityCheckInterval = useRef<NodeJS.Timeout>();
  const warningTimeout = useRef<NodeJS.Timeout>();
  const warningCountdown = useRef<NodeJS.Timeout>();
  const isDetectionActive = useRef(true);

  // Activity event handlers
  const handleActivity = useCallback(() => {
    if (!isDetectionActive.current) return;

    const now = new Date();
    setActivityState(prev => ({
      ...prev,
      lastActivityTime: now,
      isUserActive: true,
      inactivityWarningShown: false,
      pausedDueToInactivity: false,
    }));

    // Clear warning if shown
    if (isWarningShown) {
      setIsWarningShown(false);
      setWarningTimeRemaining(0);
      if (warningTimeout.current) {
        clearTimeout(warningTimeout.current);
      }
      if (warningCountdown.current) {
        clearInterval(warningCountdown.current);
      }
    }
  }, [isWarningShown]);

  // Check for inactivity
  const checkInactivity = useCallback(() => {
    if (!settings.enabled || !isDetectionActive.current) return;

    const now = new Date();
    const timeSinceLastActivity = now.getTime() - activityState.lastActivityTime.getTime();

    // Use effective threshold based on testing mode
    const effectiveThresholdMinutes = settings.testingMode
      ? getEffectiveThresholdMinutes(settings.thresholdMinutes)
      : settings.thresholdMinutes;
    const inactivityThreshold = effectiveThresholdMinutes * 60 * 1000; // Convert to milliseconds

    if (timeSinceLastActivity >= inactivityThreshold) {
      // User is inactive
      if (!activityState.inactivityWarningShown && settings.showWarningBeforePause) {
        // Show warning
        setActivityState(prev => ({
          ...prev,
          isUserActive: false,
          inactivityWarningShown: true,
        }));
        setIsWarningShown(true);

        // Use effective warning duration based on testing mode
        const effectiveWarningDuration = settings.testingMode
          ? getEffectiveWarningDuration(settings.warningDurationSeconds)
          : settings.warningDurationSeconds;
        setWarningTimeRemaining(effectiveWarningDuration);

        // Start warning countdown
        let remainingTime = effectiveWarningDuration;
        warningCountdown.current = setInterval(() => {
          remainingTime -= 1;
          setWarningTimeRemaining(remainingTime);
          
          if (remainingTime <= 0) {
            if (warningCountdown.current) {
              clearInterval(warningCountdown.current);
            }
            // Auto-pause after warning period
            pauseTimerDueToInactivity();
          }
        }, 1000);

      } else if (!settings.showWarningBeforePause || activityState.inactivityWarningShown) {
        // Pause immediately or after warning period
        pauseTimerDueToInactivity();
      }
    }
  }, [settings, activityState]);

  // Pause timer due to inactivity
  const pauseTimerDueToInactivity = useCallback(() => {
    setActivityState(prev => ({
      ...prev,
      isUserActive: false,
      pausedDueToInactivity: true,
    }));
    setIsWarningShown(false);
    setWarningTimeRemaining(0);

    // Emit custom event for timer components to listen to
    window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
      detail: { reason: 'inactivity', timestamp: new Date() }
    }));
  }, []);



  // Update settings
  const updateSettings = useCallback(async (newSettings: Partial<InactivitySettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
  }, [settings, setSettings]);

  // Reset activity (for manual calls)
  const resetActivity = useCallback(() => {
    handleActivity();
  }, [handleActivity]);

  // Pause detection
  const pauseDetection = useCallback(() => {
    isDetectionActive.current = false;
    if (activityCheckInterval.current) {
      clearInterval(activityCheckInterval.current);
    }
  }, []);

  // Resume detection
  const resumeDetection = useCallback(() => {
    isDetectionActive.current = true;
    startActivityMonitoring();
  }, []);

  // Start activity monitoring
  const startActivityMonitoring = useCallback(() => {
    if (!settings.enabled) return;

    // Clear existing intervals
    if (activityCheckInterval.current) {
      clearInterval(activityCheckInterval.current);
    }

    // Set up activity event listeners
    INACTIVITY_CONSTANTS.ACTIVITY_EVENTS.forEach(eventType => {
      document.addEventListener(eventType, handleActivity, { passive: true });
    });

    // Set up periodic inactivity check
    activityCheckInterval.current = setInterval(
      checkInactivity,
      INACTIVITY_CONSTANTS.ACTIVITY_CHECK_INTERVAL_MS
    );
  }, [settings.enabled, handleActivity, checkInactivity]);

  // Initialize activity monitoring
  useEffect(() => {
    startActivityMonitoring();

    return () => {
      // Cleanup
      if (activityCheckInterval.current) {
        clearInterval(activityCheckInterval.current);
      }
      if (warningTimeout.current) {
        clearTimeout(warningTimeout.current);
      }
      if (warningCountdown.current) {
        clearInterval(warningCountdown.current);
      }

      // Remove event listeners
      INACTIVITY_CONSTANTS.ACTIVITY_EVENTS.forEach(eventType => {
        document.removeEventListener(eventType, handleActivity);
      });
    };
  }, [startActivityMonitoring, handleActivity]);

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
