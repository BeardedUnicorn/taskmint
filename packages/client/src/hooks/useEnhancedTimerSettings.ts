/**
 * Enhanced Timer Settings Hook
 *
 * Manages the inactivity-detection settings. Detection runs in the shell
 * (system idle time, the desktop app only), so every change is also mirrored
 * to it; useIdleReturn sends the saved value at startup.
 *
 * Inactivity settings are stored under STORAGE_KEYS.INACTIVITY_SETTINGS.
 */

import { useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { getBackend } from '../backend';
import { InactivitySettings, DEFAULT_INACTIVITY_SETTINGS } from '../types/timer';

/** Mirror detection and reminder settings to the shell's idle monitor, where there is one. */
export async function sendIdleSettings(settings: InactivitySettings): Promise<void> {
  const idle = getBackend().platform.idle;
  if (!idle) return;
  try {
    await idle.setSettings({
      enabled: settings.enabled,
      thresholdMinutes: settings.thresholdMinutes,
      longRunHours: settings.longRunHours,
    });
  } catch (error) {
    console.warn('Failed to send the idle settings:', error);
  }
}

export function useEnhancedTimerSettings() {
  const [inactivitySettings, setInactivitySettings] = useLocalStorage<InactivitySettings>(
    STORAGE_KEYS.INACTIVITY_SETTINGS,
    DEFAULT_INACTIVITY_SETTINGS
  );

  // Only the current fields: older builds also stored warning, auto-resume
  // and testing-mode keys, which are dropped on the next save. Memoized so
  // consumers' effects keyed on it don't re-run every render.
  const enabled = inactivitySettings?.enabled ?? DEFAULT_INACTIVITY_SETTINGS.enabled;
  const thresholdMinutes = inactivitySettings?.thresholdMinutes ?? DEFAULT_INACTIVITY_SETTINGS.thresholdMinutes;
  const longRunHours = inactivitySettings?.longRunHours ?? DEFAULT_INACTIVITY_SETTINGS.longRunHours;
  const current = useMemo<InactivitySettings>(
    () => ({ enabled, thresholdMinutes, longRunHours }),
    [enabled, thresholdMinutes, longRunHours]
  );

  const updateInactivitySettings = (updates: Partial<InactivitySettings>) => {
    const next = { ...current, ...updates };
    setInactivitySettings(next);
    void sendIdleSettings(next);
  };

  const resetToDefaults = () => {
    setInactivitySettings(DEFAULT_INACTIVITY_SETTINGS);
    void sendIdleSettings(DEFAULT_INACTIVITY_SETTINGS);
  };

  return {
    inactivitySettings: current,
    updateInactivitySettings,
    resetToDefaults,
  };
}
