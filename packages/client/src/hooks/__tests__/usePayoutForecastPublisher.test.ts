import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SyncEngine, setCloudSyncForTest } from '../../cloud';
import { createMockWorkLogEntry } from '../../__tests__/setup/session-test-utils';
import { deviceZone, publishedForecast, type PayoutInputs } from '../../utils/payoutForecast';
import { usePayoutForecastPublisher } from '../usePayoutForecastPublisher';

const loaded: PayoutInputs & { isLoading: boolean } = {
  entries: [createMockWorkLogEntry()],
  sessions: [],
  tasks: [],
  withdrawals: [],
  scheduled: null,
  fundsReleaseDays: 7,
  withdrawalIntervalDays: 3,
  isLoading: false,
};
let current = loaded;

vi.mock('../usePayoutData', () => ({ usePayoutInputs: () => current }));

/** Sync, as far as the hook sees it. */
function withSync() {
  const engine = { publishForecast: vi.fn(), stop: vi.fn() };
  setCloudSyncForTest(engine as unknown as SyncEngine);
  return engine;
}

afterEach(() => {
  setCloudSyncForTest(null);
  current = loaded;
});

describe('usePayoutForecastPublisher', () => {
  it('hands sync the forecast once the payout data has loaded, and again only when it changes', () => {
    const engine = withSync();
    current = { ...loaded, isLoading: true };
    const hook = renderHook(() => usePayoutForecastPublisher());
    expect(engine.publishForecast).not.toHaveBeenCalled();

    current = loaded;
    hook.rerender();
    expect(engine.publishForecast).toHaveBeenCalledTimes(1);
    expect(engine.publishForecast).toHaveBeenCalledWith(publishedForecast(loaded, deviceZone()));

    // The same data (a re-render, a minute later): nothing new
    hook.rerender();
    expect(engine.publishForecast).toHaveBeenCalledTimes(1);

    current = { ...loaded, entries: [createMockWorkLogEntry({ amountCents: 9000 })] };
    hook.rerender();
    expect(engine.publishForecast).toHaveBeenCalledTimes(2);
  });

  it('does nothing without sync', () => {
    expect(() => renderHook(() => usePayoutForecastPublisher())).not.toThrow();
  });
});
