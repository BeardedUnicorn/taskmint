import { updateAccountSettings, useAccountSettings } from './useAccountSettings';

const updateDays = (days: number) => updateAccountSettings({ fundsReleaseDays: days });

/** How many days after a work day its earnings are released (an account setting). */
export function useFundsReleaseSettings() {
  const [settings] = useAccountSettings();
  return { days: settings.fundsReleaseDays, updateDays };
}
