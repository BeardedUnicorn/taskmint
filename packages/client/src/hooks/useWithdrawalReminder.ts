/**
 * "Withdrawal ready": the reminder for the withdrawal scheduled from Payouts'
 * upcoming releases, once on each device, when it's due.
 *
 * - Where the system can show a notification later (a phone), it's set as
 *   an alarm, so it fires with the app closed. It's set again when its time
 *   or text changes, and taken back when the schedule goes (removed,
 *   replaced, or done by a withdrawal) or OS notifications are switched off.
 *   One the phone first hears of after it's due is shown right away.
 * - Elsewhere (a desktop, a browser) the app shows it itself, at its time
 *   and on every check after (each minute, and when the window comes back),
 *   so a computer that was asleep or closed then sends it once TaskMint runs.
 * - Neither happens while the work logs and sessions are still loading, so
 *   the amount it says is never short.
 */

import { useEffect } from 'react';
import { WITHDRAWAL_REMINDER_ID } from '@taskmint/contracts';
import { getBackend } from '../backend';
import { useNotification } from '../contexts/NotificationContext';
import { useNotificationPreferences } from '../notifications/preferences';
import type { NotifyOptions } from '../notifications/types';
import { formatCents, formatWholeCents } from '../utils/payoutCalculator';
import { readLocal, writeLocal } from '../utils/localStore';
import { WithdrawalReminder } from '../utils/withdrawals';
import { usePayoutData } from './usePayoutData';

/** The reminder (`id@dueMs`) this device showed, or found its alarm had. */
export const WITHDRAWAL_REMINDER_SENT_KEY = 'withdrawalReminderSent';
/** The alarm this device set (`id@dueMs|text`), or null. */
export const WITHDRAWAL_REMINDER_ALARM_KEY = 'withdrawalReminderAlarm';
/** The alarm's id: setting it again replaces it (a tap reports it, which says it's about Payouts). */
export const WITHDRAWAL_REMINDER_ALARM_ID = WITHDRAWAL_REMINDER_ID;

const CHECK_INTERVAL_MS = 60_000;

/**
 * "~$1,235 is ready to withdraw." Estimates in whole dollars: they move with
 * tracked time, and a phone's alarm is set again whenever the text changes.
 */
export function withdrawalReminderMessage(reminder: WithdrawalReminder): string {
  const { amount } = reminder;
  if (amount === null) return 'The withdrawal you scheduled is ready.';
  const total = amount.estimatedCents > 0 ? `~${formatWholeCents(amount.totalCents)}` : formatCents(amount.totalCents);
  return `${total} is ready to withdraw.`;
}

const TITLE = 'Withdrawal ready';

const reminderKey = (reminder: WithdrawalReminder) => `${reminder.id}@${reminder.dueMs}`;

function reminderNotice(message: string): NotifyOptions {
  return {
    category: 'withdrawal',
    severity: 'success',
    title: TITLE,
    message,
    actions: [{ label: 'Open Payouts', view: 'payouts' }],
  };
}

const readMarker = (key: string) => readLocal<string | null>(key, null);
const writeMarker = (key: string, value: string | null) => writeLocal<string | null>(key, value, null);

export function useWithdrawalReminder(): void {
  const { reminder, isLoading } = usePayoutData();
  const { notify } = useNotification();
  const [{ desktopEnabled }] = useNotificationPreferences();
  const { schedule, cancel } = getBackend().platform.notifications;
  const setsAlarms = Boolean(schedule && cancel);

  const key = reminder ? reminderKey(reminder) : null;
  const dueMs = reminder?.dueMs ?? null;
  const message = reminder ? withdrawalReminderMessage(reminder) : null;

  // Shown by the app: at its time, or on the first check after
  useEffect(() => {
    if (setsAlarms || isLoading || key === null || dueMs === null || message === null) return;
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      const left = dueMs - Date.now();
      if (left > 0) {
        timer = window.setTimeout(check, Math.min(left, CHECK_INTERVAL_MS));
        return;
      }
      if (readMarker(WITHDRAWAL_REMINDER_SENT_KEY) === key) return;
      // Recorded first: a second check can't send it again
      writeMarker(WITHDRAWAL_REMINDER_SENT_KEY, key);
      notify(reminderNotice(message));
    };

    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [setsAlarms, isLoading, key, dueMs, message, notify]);

  // Set as the phone's alarm
  useEffect(() => {
    if (!schedule || !cancel || isLoading) return;
    const armed = readMarker(WITHDRAWAL_REMINDER_ALARM_KEY);
    const takeBack = () => {
      writeMarker(WITHDRAWAL_REMINDER_ALARM_KEY, null);
      cancel(WITHDRAWAL_REMINDER_ALARM_ID).catch(error =>
        console.warn("Failed to take back the withdrawal's reminder:", error)
      );
    };
    if (key === null || dueMs === null || message === null || !desktopEnabled) {
      if (armed !== null) takeBack();
      return;
    }

    if (dueMs <= Date.now()) {
      // Its alarm has gone off; one never set is shown now, and the alarm of
      // the one it replaced is taken back
      if (armed?.startsWith(`${key}|`)) return;
      if (armed !== null) takeBack();
      if (readMarker(WITHDRAWAL_REMINDER_SENT_KEY) === key) return;
      writeMarker(WITHDRAWAL_REMINDER_SENT_KEY, key);
      notify(reminderNotice(message));
      return;
    }

    const alarm = `${key}|${message}`;
    if (armed === alarm) return;
    writeMarker(WITHDRAWAL_REMINDER_ALARM_KEY, alarm);
    schedule({ id: WITHDRAWAL_REMINDER_ALARM_ID, atMs: dueMs, kind: 'withdrawalReady', title: TITLE, body: message })
      .then(set => {
        if (!set) writeMarker(WITHDRAWAL_REMINDER_ALARM_KEY, null);
      })
      .catch(error => {
        writeMarker(WITHDRAWAL_REMINDER_ALARM_KEY, null);
        console.warn("Failed to set the withdrawal's reminder:", error);
      });
  }, [schedule, cancel, isLoading, key, dueMs, message, desktopEnabled, notify]);
}
