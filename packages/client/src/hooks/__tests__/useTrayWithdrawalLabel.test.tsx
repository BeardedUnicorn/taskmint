import { describe, expect, it, vi } from 'vitest';
import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { PayoutData, PayoutDataContext } from '../usePayoutData';
import { trayWithdrawalLabel, useTrayWithdrawalLabel } from '../useTrayWithdrawalLabel';
import { createMockAmount, createMockPayoutData, createMockPlan } from '../../__tests__/setup/payout-test-utils';

function withData(initial: Partial<PayoutData>) {
  let value = createMockPayoutData(initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PayoutDataContext.Provider value={value}>{children}</PayoutDataContext.Provider>
  );
  const hook = renderHook(() => useTrayWithdrawalLabel(), { wrapper });
  return {
    change(next: Partial<PayoutData>) {
      value = createMockPayoutData(next);
      hook.rerender();
    },
  };
}

describe('trayWithdrawalLabel', () => {
  it('says when the next withdrawal opens and how much, when it is open, or nothing', () => {
    expect(trayWithdrawalLabel(null)).toBeNull();
    expect(trayWithdrawalLabel(createMockPlan())).toBe('Next withdrawal: Tue, Nov 10, 6:25 PM · $1,100.00');
    expect(
      trayWithdrawalLabel(
        createMockPlan({ isOpen: true, next: createMockAmount({ actualCents: 100, estimatedCents: 50 }) })
      )
    ).toBe('Withdrawal open · ~$1.50 available');
  });
});

describe('useTrayWithdrawalLabel', () => {
  it('sends the tray its line whenever it changes', async () => {
    const tray = fakeBackend().platform.tray.setWithdrawalLabel;
    tray.mockClear();
    const hook = withData({ plan: createMockPlan() });
    expect(tray).toHaveBeenLastCalledWith('Next withdrawal: Tue, Nov 10, 6:25 PM · $1,100.00');

    // The same line again (another tick): not sent again
    hook.change({ plan: createMockPlan(), nowMs: Date.now() + 1000 });
    expect(tray).toHaveBeenCalledTimes(1);

    hook.change({ plan: null });
    await waitFor(() => expect(tray).toHaveBeenLastCalledWith(null));
  });

  it('logs a line the tray refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeBackend().platform.tray.setWithdrawalLabel.mockRejectedValueOnce(new Error('no tray'));
    withData({ plan: createMockPlan() });
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith("Failed to update the tray's withdrawal line:", new Error('no tray'))
    );
  });

  it('sends nothing where there is no tray', () => {
    const web = installFakeBackendForTest({ without: ['tray'] });
    withData({ plan: createMockPlan() });
    expect(web.platform.tray).toBeUndefined();
  });
});
