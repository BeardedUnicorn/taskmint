/**
 * Timer Settings Hook
 * 
 * Manages timer-related settings including rounding preferences
 */

import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { TimerSettings, TimerRoundingOption } from '../types/timer';

const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  roundingOption: 'none',
};

export function useTimerSettings() {
  const [settings, setSettings] = useLocalStorage<TimerSettings>(
    STORAGE_KEYS.TIMER_SETTINGS,
    DEFAULT_TIMER_SETTINGS
  );

  const updateRoundingOption = (roundingOption: TimerRoundingOption) => {
    setSettings(prev => ({
      ...prev,
      roundingOption,
    }));
  };

  return {
    settings,
    updateRoundingOption,
    roundingOption: settings.roundingOption,
  };
}
