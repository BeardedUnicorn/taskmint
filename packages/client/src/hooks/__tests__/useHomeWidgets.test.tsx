/**
 * Sending the home-screen widgets their snapshot: once the data has loaded,
 * and again only when its text changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { createMockPayoutData } from '../../__tests__/setup/payout-test-utils';
import { DailyGoalProgressContext } from '../../contexts/DailyGoalProgressContext';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import type { TaskSession } from '../../types/timer';
import { MINUTE, NOW, cell, working } from '../../widgets/__tests__/widgetFixtures';
import { DailyGoalContext, UseDailyGoalsReturn } from '../useDailyGoals';
import { useHomeWidgets } from '../useHomeWidgets';
import { PayoutDataContext, type PayoutData } from '../usePayoutData';
import { UseWithdrawalsReturn, WithdrawalsContext } from '../useWithdrawals';

const state = vi.hoisted(() => ({ sessions: [] as TaskSession[] }));
vi.mock('../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: state.sessions }),
}));

const progress = { enabled: true, percent: 63.6, earned: 63.6, target: 100, currency: 'USD' };
const goals = {
  currentGoal: { targetAmount: 100, isEnabled: true },
  achievements: [],
} as unknown as UseDailyGoalsReturn;
const withdrawals = { withdrawals: [] } as unknown as UseWithdrawalsReturn;

const payout = (overrides: Partial<PayoutData> = {}) =>
  createMockPayoutData({
    nowMs: NOW,
    cells: [cell({ estimatedCents: 4_550, trackedMs: 133 * MINUTE })],
    ...overrides,
  });

describe('useHomeWidgets', () => {
  beforeEach(() => {
    installFakeBackendForTest({});
    state.sessions = [working(false)];
  });

  function render(data: { payout: PayoutData }) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PayoutDataContext.Provider value={data.payout}>
        <DailyGoalContext.Provider value={goals}>
          <WithdrawalsContext.Provider value={withdrawals}>
            <DailyGoalProgressContext.Provider value={progress}>{children}</DailyGoalProgressContext.Provider>
          </WithdrawalsContext.Provider>
        </DailyGoalContext.Provider>
      </PayoutDataContext.Provider>
    );
    return renderHook(() => useHomeWidgets(), { wrapper });
  }

  it('sends the figures once loaded, and again only when they change', () => {
    const data = { payout: payout({ isLoading: true }) };
    const { rerender } = render(data);
    const { update } = fakeBackend().platform.widgets;
    expect(update).not.toHaveBeenCalled();

    data.payout = payout();
    rerender();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({
      version: 2,
      updatedAtMs: expect.any(Number),
      today: { money: '~$46' },
      week: { goalLevel: 9100 },
    });

    // A second on, the same text: nothing new to send
    data.payout = payout({ nowMs: NOW + 1_000 });
    rerender();
    expect(update).toHaveBeenCalledTimes(1);
    data.payout = payout({ cells: [cell({ estimatedCents: 9_900, trackedMs: 300 * MINUTE })] });
    rerender();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does nothing where there are no widgets', () => {
    installFakeBackendForTest({ without: ['widgets'] });
    expect(() => render({ payout: payout() })).not.toThrow();
  });
});
