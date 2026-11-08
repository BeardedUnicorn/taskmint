import { z } from 'zod';
import { STORAGE_KEYS } from '../constants';
import { useLocalSetting } from './useLocalSetting';

export const DEFAULT_WITHDRAWAL_INTERVAL_DAYS = 3;
const WithdrawalIntervalDaysSchema = z.number().int().min(0);

/**
 * How many days the payment site makes you wait between withdrawals (a
 * device setting); the wait is counted to the minute, days × 24 hours from
 * the last withdrawal.
 */
export function useWithdrawalIntervalSetting() {
  const [days, updateDays] = useLocalSetting(
    STORAGE_KEYS.WITHDRAWAL_INTERVAL_DAYS,
    DEFAULT_WITHDRAWAL_INTERVAL_DAYS,
    WithdrawalIntervalDaysSchema
  );
  return { days, updateDays };
}
