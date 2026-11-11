/**
 * Publishes the payout forecast for BudgetMint (utils/payoutForecast) through
 * cloud sync, whenever this device's changes: the engine publishes it once
 * this device is linked and has the cloud's data, and only if the cloud
 * doesn't have it already. Nothing without sync, and nothing while the
 * payout data is still loading (it would publish numbers about to change).
 * The forecast doesn't depend on the clock, so it changes only with the data.
 */

import { useEffect, useMemo } from 'react';
import { getCloudSync } from '../cloud';
import { deviceZone, publishedForecast } from '../utils/payoutForecast';
import { usePayoutInputs } from './usePayoutData';

export function usePayoutForecastPublisher(): void {
  const { entries, sessions, tasks, withdrawals, scheduled, fundsReleaseDays, withdrawalIntervalDays, isLoading } =
    usePayoutInputs();
  const sync = getCloudSync();

  const doc = useMemo(
    () =>
      sync && !isLoading
        ? publishedForecast(
            { entries, sessions, tasks, withdrawals, scheduled, fundsReleaseDays, withdrawalIntervalDays },
            deviceZone()
          )
        : null,
    [sync, isLoading, entries, sessions, tasks, withdrawals, scheduled, fundsReleaseDays, withdrawalIntervalDays]
  );

  useEffect(() => {
    if (sync && doc) sync.publishForecast(doc);
  }, [sync, doc]);
}
