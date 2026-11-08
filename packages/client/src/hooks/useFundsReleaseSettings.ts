import { z } from 'zod';
import { STORAGE_KEYS } from '../constants';
import { useLocalSetting } from './useLocalSetting';

const DEFAULT_FUNDS_RELEASE_DAYS = 7;
const FundsReleaseDaysSchema = z.number().int().min(0);

/** How many days after a work day its earnings are released (a device setting). */
export function useFundsReleaseSettings() {
  const [days, updateDays] = useLocalSetting(
    STORAGE_KEYS.FUNDS_RELEASE_DAYS,
    DEFAULT_FUNDS_RELEASE_DAYS,
    FundsReleaseDaysSchema
  );
  return { days, updateDays };
}
