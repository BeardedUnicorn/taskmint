/**
 * Sending the home-screen widgets their snapshot: once the data has loaded,
 * and again only when its text changes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { createMockPayoutData } from '../../__tests__/setup/payout-test-utils';
import { SyncEngine, setCloudSyncForTest } from '../../cloud';
import { DailyGoalProgressContext } from '../../contexts/DailyGoalProgressContext';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import type { TaskSession } from '../../types/timer';
import { MINUTE, NOW, cell, working } from '../../widgets/__tests__/widgetFixtures';
import { PUBLISH_EVERY_MS } from '../../widgets/publishedWidgets';
import { DailyGoalContext, UseDailyGoalsReturn } from '../useDailyGoals';
import { useHomeWidgets } from '../useHomeWidgets';
import { PayoutDataContext, type PayoutData } from '../usePayoutData';
import { UseWithdrawalsReturn, WithdrawalsContext } from '../useWithdrawals';

const state = vi.hoisted(() => ({ sessions: [] as TaskSession[] }));
vi.mock('../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: state.sessions }),
}));
vi.mock('../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => ({ tasks: [] }),
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

    // A second on, the running timer has a second more: the same text (and
    // today's time still counts from the same moment), so nothing new to send
    data.payout = payout({
      nowMs: NOW + 1_000,
      cells: [cell({ estimatedCents: 4_550, trackedMs: 133 * MINUTE + 1_000 })],
    });
    rerender();
    expect(update).toHaveBeenCalledTimes(1);
    data.payout = payout({ cells: [cell({ estimatedCents: 9_900, trackedMs: 300 * MINUTE })] });
    rerender();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('sends the figures again when the page comes back in front', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    const { unmount } = render({ payout: payout() });
    const { update } = fakeBackend().platform.widgets;
    expect(update).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);

    unmount();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it('tells the phone’s own sync whether the timer’s notification is wanted', () => {
    render({ payout: payout() });
    expect(fakeBackend().platform.backgroundSync.setTimerNotice.mock.calls).toEqual([[true]]);
  });

  it('does nothing where there are no widgets', () => {
    installFakeBackendForTest({ without: ['widgets', 'backgroundSync'] });
    expect(() => render({ payout: payout() })).not.toThrow();
  });

  describe('with cloud sync', () => {
    const engine = { publishWidgets: vi.fn(), stop: vi.fn() };
    /** A minute on: the running timer's figures have grown. */
    const minutesOn = (minutes: number) =>
      payout({
        nowMs: NOW + minutes * MINUTE,
        cells: [cell({ estimatedCents: 4_550 + minutes * 100, trackedMs: (133 + minutes) * MINUTE })],
      });

    beforeEach(() => {
      engine.publishWidgets.mockClear();
      setCloudSyncForTest(engine as unknown as SyncEngine);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
      setCloudSyncForTest(null);
    });

    it('publishes the figures once loaded, without their time', () => {
      const data = { payout: payout({ isLoading: true }) };
      const { rerender } = render(data);
      expect(engine.publishWidgets).not.toHaveBeenCalled();

      data.payout = payout();
      rerender();
      expect(engine.publishWidgets).toHaveBeenCalledTimes(1);
      const doc = engine.publishWidgets.mock.calls[0][0];
      expect(doc).toMatchObject({ schema: 2, hash: expect.any(String) });
      const figures = JSON.parse(doc.json);
      expect(figures).toMatchObject({ version: 2, today: { money: '~$46' }, timer: { task: 'Writing' } });
      expect(figures.zone).toEqual(expect.any(String));
      expect(figures).not.toHaveProperty('updatedAtMs');
    });

    it('publishes a running timer’s growing figures every quarter of an hour, a change to the timer at once', () => {
      const data = { payout: payout() };
      const { rerender } = render(data);
      expect(engine.publishWidgets).toHaveBeenCalledTimes(1);

      vi.setSystemTime(NOW + MINUTE);
      data.payout = minutesOn(1);
      rerender();
      expect(engine.publishWidgets).toHaveBeenCalledTimes(1);

      vi.setSystemTime(NOW + PUBLISH_EVERY_MS);
      data.payout = minutesOn(15);
      rerender();
      expect(engine.publishWidgets).toHaveBeenCalledTimes(2);

      // Paused a minute later: the phone hears at once
      vi.setSystemTime(NOW + PUBLISH_EVERY_MS + MINUTE);
      state.sessions = [working(true)];
      data.payout = minutesOn(16);
      rerender();
      expect(engine.publishWidgets).toHaveBeenCalledTimes(3);
      expect(JSON.parse(engine.publishWidgets.mock.calls[2][0].json).timer).toMatchObject({ countingFromMs: null });

      // Standing still, every change goes out
      data.payout = payout({ cells: [cell({ estimatedCents: 9_900, trackedMs: 300 * MINUTE })] });
      rerender();
      expect(engine.publishWidgets).toHaveBeenCalledTimes(4);
    });

    it('publishes nothing too large for the rules', () => {
      const session = working(false);
      state.sessions = [{ ...session, taskName: 'W'.repeat(200_001) }];
      render({ payout: payout() });
      expect(engine.publishWidgets).not.toHaveBeenCalled();
    });
  });
});
