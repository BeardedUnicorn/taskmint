/**
 * What the home-screen widgets show: today's money, time and goal, the live
 * timer, and the next withdrawal, sent as it changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { createMockPayoutData, createMockPlan, createMockAmount } from '../../__tests__/setup/payout-test-utils';
import { createMockTaskSession, createMockTimerInstance } from '../../__tests__/setup/session-test-utils';
import { DailyGoalProgressContext } from '../../contexts/DailyGoalProgressContext';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import type { TaskSession } from '../../types/timer';
import type { PayoutDayCell } from '../../utils/payoutCalculator';
import { useHomeWidgets, widgetSnapshot } from '../useHomeWidgets';
import { PayoutDataContext, type PayoutData } from '../usePayoutData';

const state = vi.hoisted(() => ({ sessions: [] as TaskSession[] }));
vi.mock('../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: state.sessions }),
}));

const MINUTE = 60_000;
const NOW = new Date(2026, 10, 13, 14, 0).getTime();
const goal = { enabled: true, percent: 63.6, earned: 63.6, target: 100, currency: 'USD' };
const noGoal = { ...goal, enabled: false, percent: 0 };

const cell = (overrides: Partial<PayoutDayCell>): PayoutDayCell =>
  ({
    workDay: '2026-11-13',
    taskId: 't',
    taskName: 'Writing',
    actualCents: 0,
    estimatedCents: 0,
    trackedMs: 0,
    importedMinutes: 0,
    statuses: [],
    releaseDay: '2026-11-20',
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
    ...overrides,
  }) as PayoutDayCell;

const payout = (overrides: Partial<PayoutData> = {}) =>
  createMockPayoutData({
    nowMs: NOW,
    cells: [cell({ estimatedCents: 4_550, trackedMs: 133 * MINUTE })],
    ...overrides,
  });

/** A session on "Writing" whose timer started 50 minutes ago (10 more paused), running or paused. */
const working = (paused: boolean) =>
  createMockTaskSession({
    taskName: 'Writing',
    isActive: true,
    timerInstances: [
      createMockTimerInstance({
        startTime: new Date(NOW - 60 * MINUTE).toISOString(),
        pausedDuration: 10 * MINUTE,
        isRunning: !paused,
        isPaused: paused,
        pausedAt: paused ? new Date(NOW).toISOString() : undefined,
      }),
    ],
  });

describe('widgetSnapshot', () => {
  it("shows today's money and time, the goal, and the running timer counting", () => {
    expect(widgetSnapshot(payout(), goal, [working(false)])).toEqual({
      today: { money: '~$46', time: '2h 13m', goalPercent: 64 },
      timer: { task: 'Writing', countingFromMs: NOW - 50 * MINUTE, status: null },
      payouts: {
        amount: '',
        status: 'Record a withdrawal in TaskMint to see the next one.',
        opensAtMs: null,
        nextRelease: null,
      },
    });
  });

  it('says where a paused timer stopped, and leaves the goal and timer out when there are none', () => {
    expect(widgetSnapshot(payout(), noGoal, [working(true)])).toMatchObject({
      today: { goalPercent: null },
      timer: { task: 'Writing', countingFromMs: null, status: 'Paused at 50m' },
    });
    // Imported money isn't an estimate; nothing running or paused
    const imported = payout({ cells: [cell({ actualCents: 12_000, importedMinutes: 90 })] });
    expect(widgetSnapshot(imported, noGoal, [])).toMatchObject({
      today: { money: '$120', time: '1h 30m' },
      timer: null,
    });
  });

  it('says when the next withdrawal opens, or that it is open, and the next release', () => {
    const plan = createMockPlan({ next: createMockAmount({ actualCents: 110_000, estimatedCents: 2_345 }) });
    const summary = { ...payout().summary, nextReleaseDay: '2026-11-14', nextReleaseCents: 23_000 };
    expect(widgetSnapshot(payout({ plan, summary }), goal, []).payouts).toEqual({
      amount: '~$1,123',
      status: 'Opens Tue, Nov 10, 6:25 PM',
      opensAtMs: plan.opensAtMs,
      nextRelease: 'Next release Sat, Nov 14 · $230',
    });

    const open = createMockPlan({ isOpen: true });
    expect(widgetSnapshot(payout({ plan: open }), goal, []).payouts).toMatchObject({
      amount: '$1,100',
      status: 'Withdrawal open',
      opensAtMs: null,
    });
  });
});

describe('useHomeWidgets', () => {
  beforeEach(() => {
    installFakeBackendForTest({});
    state.sessions = [working(false)];
  });

  function render(data: { payout: PayoutData }) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PayoutDataContext.Provider value={data.payout}>
        <DailyGoalProgressContext.Provider value={goal}>{children}</DailyGoalProgressContext.Provider>
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
    expect(update.mock.calls[0][0]).toMatchObject({ updatedAtMs: expect.any(Number), today: { money: '~$46' } });

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
