/**
 * The end-of-day summary: once a day, at the time set in Settings →
 * Notifications, a reminder of the time tracked and earned today. It goes to
 * the OS like the other reminders (a toast too while you're looking at the
 * app).
 *
 * Checked every minute and whenever the window comes back, so a Mac that was
 * asleep at the summary time sends it on waking (the same evening; a missed
 * day isn't sent later). A day with nothing tracked by then is skipped. A
 * phone sets it as an alarm instead, which goes off with the app closed
 * (usePhoneReminders).
 */

import { useEffect, useRef } from 'react';
import { TaskSession } from '../types/timer';
import { Task } from '../types/task';
import { DailyGoal } from '../types/goal';
import { getInstanceElapsedMs, getTimersOnDate, hasRunningTimer, instanceTaskId } from '../utils/timerHelpers';
import { earningsOnDate } from '../utils/earnings';
import { formatDateString } from '../utils/dateHelpers';
import { formatCurrency, formatDurationCompact } from '../utils/formatters';
import { readLocal, writeLocal } from '../utils/localStore';
import { getBackend } from '../backend';
import { useNotification } from '../contexts/NotificationContext';
import { useNotificationPreferences } from '../notifications/preferences';
import { useDailyGoals } from './useDailyGoals';

/** The local day (YYYY-MM-DD) the summary was last sent, or skipped. */
export const DAILY_SUMMARY_LAST_SENT_KEY = 'dailySummaryLastSent';

const CHECK_INTERVAL_MS = 60_000;

/** Whether today's summary is due: past the set time and not yet sent today. */
export function isDailySummaryDue(now: Date, time: string, lastSent: string | null): boolean {
  if (lastSent === formatDateString(now)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes;
}

/** "6h 12m", "45m", or "under a minute". */
function trackedText(ms: number): string {
  return ms < 60_000 ? 'under a minute' : formatDurationCompact(ms);
}

export interface DailySummary {
  title: string;
  message: string;
}

/** The summary for `date`, or null when nothing was tracked that day. */
export function buildDailySummary({
  sessions,
  tasks,
  goal,
  date,
  nowMs,
}: {
  sessions: TaskSession[];
  tasks: Task[];
  goal: DailyGoal | null;
  date: string;
  nowMs: number;
}): DailySummary | null {
  let trackedMs = 0;
  const taskIds = new Set<string>();
  for (const session of sessions) {
    for (const instance of getTimersOnDate(session, date)) {
      const ms = getInstanceElapsedMs(instance, nowMs);
      if (ms > 0) {
        trackedMs += ms;
        taskIds.add(instanceTaskId(instance, session));
      }
    }
  }
  if (trackedMs === 0) return null;

  const currency = goal?.currency ?? 'USD';
  const earned = earningsOnDate(sessions, tasks, date, nowMs);
  const parts = [
    `${formatCurrency(earned, currency)} earned across ${taskIds.size} task${taskIds.size === 1 ? '' : 's'}`,
  ];
  if (goal?.isEnabled && goal.targetAmount > 0) {
    const percent = Math.round((earned / goal.targetAmount) * 100);
    parts.push(`${percent}% of your ${formatCurrency(goal.targetAmount, currency)} goal`);
  }
  if (hasRunningTimer(sessions)) parts.push('a timer is still running');

  return { title: `Today: ${trackedText(trackedMs)} tracked`, message: parts.join(' · ') };
}

/**
 * Sends the summary when it's due. `ready` waits for the saved sessions, so
 * the startup check doesn't mistake "not loaded yet" for "nothing tracked".
 */
export function useDailySummary({
  sessions,
  tasks,
  ready,
}: {
  sessions: TaskSession[];
  tasks: Task[];
  ready: boolean;
}): void {
  const [preferences] = useNotificationPreferences();
  const { currentGoal } = useDailyGoals();
  const { notify } = useNotification();

  const latestRef = useRef({ sessions, tasks, currentGoal });
  useEffect(() => {
    latestRef.current = { sessions, tasks, currentGoal };
  }, [sessions, tasks, currentGoal]);

  const { dailySummary: enabled, dailySummaryTime: time } = preferences;

  useEffect(() => {
    // (A phone's alarm sends it: usePhoneReminders)
    if (!enabled || !ready || getBackend().platform.notifications.schedule) return;

    const check = () => {
      const now = new Date();
      if (!isDailySummaryDue(now, time, readLocal<string | null>(DAILY_SUMMARY_LAST_SENT_KEY, null))) return;

      const date = formatDateString(now);
      // Recorded first: a second check can't send it again
      writeLocal<string | null>(DAILY_SUMMARY_LAST_SENT_KEY, date, null);

      const { sessions, tasks, currentGoal } = latestRef.current;
      const summary = buildDailySummary({ sessions, tasks, goal: currentGoal, date, nowMs: now.getTime() });
      if (!summary) return;
      notify({
        category: 'dailySummary',
        severity: 'info',
        title: summary.title,
        message: summary.message,
        actions: [{ label: 'Open History', view: 'history' }],
      });
    };

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, ready, time, notify]);
}
