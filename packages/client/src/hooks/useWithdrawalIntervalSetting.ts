import { updateAccountSettings, useAccountSettings } from './useAccountSettings';

const updateDays = (days: number) => updateAccountSettings({ withdrawalIntervalDays: days });

/**
 * How many days the payment site makes you wait between withdrawals (an
 * account setting); the wait is counted to the minute, days × 24 hours from
 * the last withdrawal.
 */
export function useWithdrawalIntervalSetting() {
  const [settings] = useAccountSettings();
  return { days: settings.withdrawalIntervalDays, updateDays };
}
