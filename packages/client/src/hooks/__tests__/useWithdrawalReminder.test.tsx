import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { PayoutDataContext } from '../usePayoutData';
import { createMockAmount, createMockPayoutData } from '../../__tests__/setup/payout-test-utils';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { readLocal, writeLocal } from '../../utils/localStore';
import { NOTIFICATION_PREFERENCES_KEY } from '../../notifications/preferences';
import { WithdrawalReminder } from '../../utils/withdrawals';
import {
  WITHDRAWAL_REMINDER_ALARM_ID,
  WITHDRAWAL_REMINDER_ALARM_KEY,
  WITHDRAWAL_REMINDER_SENT_KEY,
  useWithdrawalReminder,
  withdrawalReminderMessage,
} from '../useWithdrawalReminder';

const mockNotify = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify }),
}));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DUE = new Date(2026, 10, 12, 18, 25).getTime();
const MESSAGE = '$1,234.50 is ready to withdraw.';

const reminder = (overrides: Partial<WithdrawalReminder> = {}): WithdrawalReminder => ({
  id: 's1',
  releaseMs: DUE - HOUR,
  dueMs: DUE,
  isHeld: true,
  amount: createMockAmount({ actualCents: 123450 }),
  ...overrides,
});

const notice = (message = MESSAGE) => ({
  category: 'withdrawal',
  severity: 'success',
  title: 'Withdrawal ready',
  message,
  actions: [{ label: 'Open Payouts', view: 'payouts' }],
});

/**
 * The hook over payout data whose reminder is `shown.reminder`, still loading
 * while `shown.isLoading` (change them, then rerender).
 */
function renderReminder(initial: WithdrawalReminder | null, isLoading = false) {
  const shown = { reminder: initial, isLoading };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PayoutDataContext.Provider value={createMockPayoutData({ reminder: shown.reminder, isLoading: shown.isLoading })}>
      {children}
    </PayoutDataContext.Provider>
  );
  return { shown, ...renderHook(() => useWithdrawalReminder(), { wrapper }) };
}

/** A desktop or a browser: nothing can be set for later, so the app shows it. */
const onADesktop = () => installFakeBackendForTest({ without: ['laterNotifications'] });

describe('withdrawalReminderMessage', () => {
  it('says how much is ready, estimates in whole dollars', () => {
    expect(withdrawalReminderMessage(reminder())).toBe(MESSAGE);
    expect(
      withdrawalReminderMessage(reminder({ amount: createMockAmount({ actualCents: 100000, estimatedCents: 3456 }) }))
    ).toBe('~$1,035 is ready to withdraw.');
    expect(withdrawalReminderMessage(reminder({ amount: null }))).toBe('The withdrawal you scheduled is ready.');
  });
});

describe('useWithdrawalReminder', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockNotify.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('where the app shows it', () => {
    it('sends it once, at its time', () => {
      onADesktop();
      vi.setSystemTime(DUE - 90_000);
      renderReminder(reminder());
      act(() => {
        vi.advanceTimersByTime(MINUTE);
      });
      expect(mockNotify).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(notice());
      expect(readLocal(WITHDRAWAL_REMINDER_SENT_KEY, null)).toBe(`s1@${DUE}`);

      act(() => {
        vi.advanceTimersByTime(5 * MINUTE);
        window.dispatchEvent(new Event('focus'));
      });
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it('sends it late once TaskMint runs again, and not twice', () => {
      onADesktop();
      vi.setSystemTime(DUE + HOUR);
      const first = renderReminder(reminder());
      expect(mockNotify).toHaveBeenCalledTimes(1);
      first.unmount();

      renderReminder(reminder());
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it('waits for the numbers to load before sending a late one', () => {
      onADesktop();
      vi.setSystemTime(DUE + HOUR);
      const { shown, rerender } = renderReminder(reminder({ amount: createMockAmount() }), true);
      expect(mockNotify).not.toHaveBeenCalled();
      expect(readLocal(WITHDRAWAL_REMINDER_SENT_KEY, null)).toBeNull();

      shown.reminder = reminder();
      shown.isLoading = false;
      rerender();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(notice());
    });

    it('sends it when the computer wakes after its time', () => {
      onADesktop();
      vi.setSystemTime(DUE - HOUR);
      renderReminder(reminder());
      // Asleep: the clock moves on without the timers
      vi.setSystemTime(DUE + HOUR);
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockNotify).toHaveBeenCalledWith(notice());
    });

    it('sends nothing for a reminder removed before its time, nor without one', () => {
      onADesktop();
      vi.setSystemTime(DUE - MINUTE);
      const { shown, rerender } = renderReminder(reminder());
      shown.reminder = null;
      rerender();
      act(() => {
        vi.advanceTimersByTime(2 * MINUTE);
      });
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('sends a moved reminder again at its new time', () => {
      onADesktop();
      vi.setSystemTime(DUE + MINUTE);
      const { shown, rerender } = renderReminder(reminder());
      expect(mockNotify).toHaveBeenCalledTimes(1);

      shown.reminder = reminder({ dueMs: DUE + HOUR });
      rerender();
      act(() => {
        vi.advanceTimersByTime(HOUR);
      });
      expect(mockNotify).toHaveBeenCalledTimes(2);
    });
  });

  describe("where it's a phone's alarm", () => {
    const alarm = { id: WITHDRAWAL_REMINDER_ALARM_ID, atMs: DUE, kind: 'withdrawalReady', title: 'Withdrawal ready' };

    beforeEach(() => {
      vi.setSystemTime(DUE - 24 * HOUR);
      fakeBackend().platform.notifications.schedule.mockResolvedValue(true);
    });

    it('sets it for its time, again when its text changes, and takes it back when it goes', async () => {
      const { schedule, cancel } = fakeBackend().platform.notifications;
      const { shown, rerender } = renderReminder(reminder());
      expect(schedule).toHaveBeenCalledWith({ ...alarm, body: MESSAGE });
      expect(readLocal(WITHDRAWAL_REMINDER_ALARM_KEY, null)).toBe(`s1@${DUE}|${MESSAGE}`);

      // The same alarm isn't set twice, nor again when the app starts over
      shown.reminder = reminder();
      rerender();
      renderReminder(reminder()).unmount();
      expect(schedule).toHaveBeenCalledTimes(1);

      shown.reminder = reminder({ amount: createMockAmount({ actualCents: 200000 }) });
      rerender();
      expect(schedule).toHaveBeenLastCalledWith({ ...alarm, body: '$2,000.00 is ready to withdraw.' });

      shown.reminder = null;
      rerender();
      expect(cancel).toHaveBeenCalledWith(WITHDRAWAL_REMINDER_ALARM_ID);
      expect(readLocal(WITHDRAWAL_REMINDER_ALARM_KEY, null)).toBeNull();
      // Nothing left to take back when the app starts over
      renderReminder(null);
      expect(cancel).toHaveBeenCalledTimes(1);
      await act(async () => {});
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('leaves the alarm alone while the numbers load, then sets it once', () => {
      const { schedule, cancel } = fakeBackend().platform.notifications;
      writeLocal(WITHDRAWAL_REMINDER_ALARM_KEY, `s1@${DUE}|${MESSAGE}`, null);
      const { shown, rerender } = renderReminder(reminder({ amount: createMockAmount() }), true);
      expect(cancel).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
      expect(readLocal(WITHDRAWAL_REMINDER_ALARM_KEY, null)).toBe(`s1@${DUE}|${MESSAGE}`);

      shown.reminder = reminder({ amount: createMockAmount({ actualCents: 200000 }) });
      shown.isLoading = false;
      rerender();
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledWith({ ...alarm, body: '$2,000.00 is ready to withdraw.' });
    });

    it("takes it back when OS notifications are switched off, and sets it again when they're on", () => {
      const { schedule, cancel } = fakeBackend().platform.notifications;
      renderReminder(reminder());
      act(() => writeLocal(NOTIFICATION_PREFERENCES_KEY, { desktopEnabled: false }, {}));
      expect(cancel).toHaveBeenCalledWith(WITHDRAWAL_REMINDER_ALARM_ID);

      act(() => writeLocal(NOTIFICATION_PREFERENCES_KEY, { desktopEnabled: true }, {}));
      expect(schedule).toHaveBeenCalledTimes(2);
    });

    it("tries again next time when the alarm wasn't set", async () => {
      const { schedule } = fakeBackend().platform.notifications;
      schedule.mockResolvedValueOnce(false);
      renderReminder(reminder());
      await act(async () => {});
      expect(readLocal(WITHDRAWAL_REMINDER_ALARM_KEY, null)).toBeNull();

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      schedule.mockRejectedValueOnce('no permission');
      renderReminder(reminder({ id: 's2' }));
      await act(async () => {});
      expect(readLocal(WITHDRAWAL_REMINDER_ALARM_KEY, null)).toBeNull();
      expect(warn).toHaveBeenCalledWith("Failed to set the withdrawal's reminder:", 'no permission');
    });

    it('reports an alarm it failed to take back', async () => {
      const { cancel } = fakeBackend().platform.notifications;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      cancel.mockRejectedValueOnce('gone');
      writeLocal(WITHDRAWAL_REMINDER_ALARM_KEY, `s1@${DUE}|${MESSAGE}`, null);
      renderReminder(null);
      await act(async () => {});
      expect(warn).toHaveBeenCalledWith("Failed to take back the withdrawal's reminder:", 'gone');
    });

    it('shows one it first hears of after its time, once', () => {
      vi.setSystemTime(DUE + HOUR);
      const { schedule } = fakeBackend().platform.notifications;
      const { rerender } = renderReminder(reminder());
      expect(schedule).not.toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith(notice());

      rerender();
      // Nor again when the app starts over
      renderReminder(reminder()).unmount();
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it('takes back the alarm of a reminder replaced by one already due', () => {
      const { cancel } = fakeBackend().platform.notifications;
      writeLocal(WITHDRAWAL_REMINDER_ALARM_KEY, `s1@${DUE + 2 * HOUR}|${MESSAGE}`, null);
      vi.setSystemTime(DUE + HOUR);
      renderReminder(reminder({ id: 's2' }));
      expect(cancel).toHaveBeenCalledWith(WITHDRAWAL_REMINDER_ALARM_ID);
      expect(readLocal(WITHDRAWAL_REMINDER_ALARM_KEY, null)).toBeNull();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(notice());
    });

    it('leaves one whose alarm already went off', () => {
      writeLocal(WITHDRAWAL_REMINDER_ALARM_KEY, `s1@${DUE}|${MESSAGE}`, null);
      vi.setSystemTime(DUE + HOUR);
      renderReminder(reminder({ amount: createMockAmount({ actualCents: 5 }) }));
      expect(mockNotify).not.toHaveBeenCalled();
      expect(fakeBackend().platform.notifications.cancel).not.toHaveBeenCalled();
    });
  });
});
