/**
 * Enhanced Timer Settings Hook
 * 
 * Manages enhanced timer settings including inactivity detection,
 * rounding options, and other timer-related preferences.
 */

import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { 
  EnhancedTimerSettings, 
  InactivitySettings,
  TimerRoundingOption,
  DEFAULT_ENHANCED_TIMER_SETTINGS 
} from '../types/timer';

export function useEnhancedTimerSettings() {
  const [settings, setSettings] = useLocalStorage<EnhancedTimerSettings>(
    STORAGE_KEYS.ENHANCED_TIMER_SETTINGS,
    DEFAULT_ENHANCED_TIMER_SETTINGS
  );

  const updateRoundingOption = (roundingOption: TimerRoundingOption) => {
    setSettings(prev => ({
      ...prev,
      roundingOption,
    }));
  };

  const updateInactivitySettings = (inactivitySettings: Partial<InactivitySettings>) => {
    setSettings(prev => ({
      ...prev,
      inactivity: {
        ...prev.inactivity,
        ...inactivitySettings,
      },
    }));
  };

  const updateAllSettings = (newSettings: Partial<EnhancedTimerSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...newSettings,
    }));
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_ENHANCED_TIMER_SETTINGS);
  };

  return {
    settings,
    roundingOption: settings.roundingOption,
    inactivitySettings: settings.inactivity,
    updateRoundingOption,
    updateInactivitySettings,
    updateAllSettings,
    resetToDefaults,
  };
}
