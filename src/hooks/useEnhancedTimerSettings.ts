/**
 * Enhanced Timer Settings Hook
 *
 * Manages the inactivity-detection settings and their one-time migrations.
 * Detection runs in the backend (system idle time), so every change is also
 * mirrored to it with set_idle_settings; useIdleReturn sends the saved value
 * at startup.
 *
 * Inactivity settings are stored under STORAGE_KEYS.INACTIVITY_SETTINGS.
 * (They historically lived nested inside STORAGE_KEYS.ENHANCED_TIMER_SETTINGS;
 * the legacy seed below carries such values over.)
 */

import { useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { safeInvoke } from '../utils/tauri';
import { InactivitySettings, DEFAULT_INACTIVITY_SETTINGS } from '../types/timer';

/**
 * One-time migration: if inactivity settings were only ever saved nested in
 * the enhanced-settings blob (the old Settings-page path), seed the dedicated
 * key from them so previously configured values are honored.
 */
export function seedInactivitySettingsFromLegacyEnhanced(): void {
  try {
    if (window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS) !== null) return;

    const raw = window.localStorage.getItem(STORAGE_KEYS.ENHANCED_TIMER_SETTINGS);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const data = parsed?.version ? parsed.data : parsed;
    const inactivity = data?.inactivity;
    if (!inactivity || typeof inactivity !== 'object') return;

    window.localStorage.setItem(
      STORAGE_KEYS.INACTIVITY_SETTINGS,
      JSON.stringify({
        version: 1,
        data: { ...DEFAULT_INACTIVITY_SETTINGS, ...inactivity },
        migratedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error('Failed to migrate legacy inactivity settings:', error);
  }
}

/**
 * One-time migration for the default flipping to off: detection only sees
 * activity inside TaskMint's window, so a saved `enabled: true` (from the
 * old on-by-default) would keep pausing timers while the user works in other
 * apps. Turn it off once; the flag means a later re-enable sticks.
 */
export function turnInactivityDetectionOffOnce(): void {
  try {
    if (window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED) !== null) return;

    const raw = window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      const isVersioned = Boolean(parsed?.version);
      const data = isVersioned ? parsed.data : parsed;
      if (data && typeof data === 'object' && data.enabled === true) {
        const updated = { ...data, enabled: false };
        window.localStorage.setItem(
          STORAGE_KEYS.INACTIVITY_SETTINGS,
          JSON.stringify(isVersioned ? { ...parsed, data: updated } : updated)
        );
      }
    }

    window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED, 'true');
  } catch (error) {
    console.error('Failed to apply the inactivity default-off migration:', error);
  }
}

/** Run the inactivity-settings migrations, in order, before anything reads them. */
export function prepareInactivitySettings(): void {
  seedInactivitySettingsFromLegacyEnhanced();
  turnInactivityDetectionOffOnce();
}

/** Mirror detection settings to the backend's idle monitor. */
export function sendIdleSettings(settings: InactivitySettings): Promise<unknown> {
  return safeInvoke('set_idle_settings', {
    settings: { enabled: settings.enabled, thresholdMinutes: settings.thresholdMinutes },
  });
}

export function useEnhancedTimerSettings() {
  prepareInactivitySettings();

  const [inactivitySettings, setInactivitySettings] = useLocalStorage<InactivitySettings>(
    STORAGE_KEYS.INACTIVITY_SETTINGS,
    DEFAULT_INACTIVITY_SETTINGS
  );

  // Only the current fields: older builds also stored warning, auto-resume
  // and testing-mode keys, which are dropped on the next save. Memoized so
  // consumers' effects keyed on it don't re-run every render.
  const enabled = inactivitySettings?.enabled ?? DEFAULT_INACTIVITY_SETTINGS.enabled;
  const thresholdMinutes =
    inactivitySettings?.thresholdMinutes ?? DEFAULT_INACTIVITY_SETTINGS.thresholdMinutes;
  const current = useMemo<InactivitySettings>(
    () => ({ enabled, thresholdMinutes }),
    [enabled, thresholdMinutes]
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
