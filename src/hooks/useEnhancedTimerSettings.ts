/**
 * Enhanced Timer Settings Hook
 *
 * Manages the inactivity-detection settings and their one-time migrations.
 *
 * Inactivity settings are stored under STORAGE_KEYS.INACTIVITY_SETTINGS — the
 * same key useInactivityDetection reads — so changes made in Settings actually
 * reach the detector. (They historically lived nested inside
 * STORAGE_KEYS.ENHANCED_TIMER_SETTINGS, which the detector never read.)
 */

import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
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

export function useEnhancedTimerSettings() {
  prepareInactivitySettings();

  const [inactivitySettings, setInactivitySettings] = useLocalStorage<InactivitySettings>(
    STORAGE_KEYS.INACTIVITY_SETTINGS,
    DEFAULT_INACTIVITY_SETTINGS
  );

  const updateInactivitySettings = (updates: Partial<InactivitySettings>) => {
    setInactivitySettings(prev => ({
      ...prev,
      ...updates,
    }));
  };

  const resetToDefaults = () => {
    setInactivitySettings(DEFAULT_INACTIVITY_SETTINGS);
  };

  return {
    inactivitySettings,
    updateInactivitySettings,
    resetToDefaults,
  };
}
