/**
 * Enhanced Timer Settings Hook
 *
 * Manages enhanced timer settings including inactivity detection,
 * rounding options, and other timer-related preferences.
 *
 * Inactivity settings are stored under STORAGE_KEYS.INACTIVITY_SETTINGS — the
 * same key useInactivityDetection reads — so changes made in Settings actually
 * reach the detector. (They historically lived nested inside
 * STORAGE_KEYS.ENHANCED_TIMER_SETTINGS, which the detector never read.)
 */

import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import {
  EnhancedTimerSettings,
  InactivitySettings,
  TimerRoundingOption,
  DEFAULT_ENHANCED_TIMER_SETTINGS,
  DEFAULT_INACTIVITY_SETTINGS,
} from '../types/timer';

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

export function useEnhancedTimerSettings() {
  seedInactivitySettingsFromLegacyEnhanced();

  const [roundingSettings, setRoundingSettings] = useLocalStorage<EnhancedTimerSettings>(
    STORAGE_KEYS.ENHANCED_TIMER_SETTINGS,
    DEFAULT_ENHANCED_TIMER_SETTINGS
  );
  const [inactivitySettings, setInactivitySettings] = useLocalStorage<InactivitySettings>(
    STORAGE_KEYS.INACTIVITY_SETTINGS,
    DEFAULT_INACTIVITY_SETTINGS
  );

  const updateRoundingOption = (roundingOption: TimerRoundingOption) => {
    setRoundingSettings(prev => ({
      ...prev,
      roundingOption,
    }));
  };

  const updateInactivitySettings = (updates: Partial<InactivitySettings>) => {
    setInactivitySettings(prev => ({
      ...prev,
      ...updates,
    }));
  };

  const updateAllSettings = (newSettings: Partial<EnhancedTimerSettings>) => {
    if (newSettings.roundingOption) {
      updateRoundingOption(newSettings.roundingOption);
    }
    if (newSettings.inactivity) {
      updateInactivitySettings(newSettings.inactivity);
    }
  };

  const resetToDefaults = () => {
    setRoundingSettings(DEFAULT_ENHANCED_TIMER_SETTINGS);
    setInactivitySettings(DEFAULT_INACTIVITY_SETTINGS);
  };

  return {
    settings: { roundingOption: roundingSettings.roundingOption, inactivity: inactivitySettings },
    roundingOption: roundingSettings.roundingOption,
    inactivitySettings,
    updateRoundingOption,
    updateInactivitySettings,
    updateAllSettings,
    resetToDefaults,
  };
}
