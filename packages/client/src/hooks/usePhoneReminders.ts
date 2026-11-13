/**
 * A phone's reminders as alarms the system shows with TaskMint closed: the
 * long-run reminder, the end-of-day summary and the daily goal's milestones
 * (utils/phoneReminders). Where the platform sets notifications for later
 * (a phone), they're worked out again whenever the sessions, tasks, goal or
 * settings change, and every minute; an alarm is set, moved or taken back
 * only when it changes. A desktop times these itself while it runs.
 */

import { useEffect, useMemo, useRef } from 'react';
import { DAILY_SUMMARY_ID, GOAL_MILESTONE_ID, LONG_RUN_REMINDER_ID } from '@taskmint/contracts';
import { getBackend } from '../backend';
import type { LaterNotification } from '../backend/types';
import { useNotificationPreferences } from '../notifications/preferences';
import type { Task } from '../types/task';
import { DEFAULT_INACTIVITY_SETTINGS, type TaskSession } from '../types/timer';
import { noteGoalAlarm } from '../utils/goalAlarms';
import { dailySummaryAlarm, GOAL_TIERS, goalMilestoneAlarms, longRunAlarm } from '../utils/phoneReminders';
import { useDailyGoals } from './useDailyGoals';
import { useEnhancedTimerSettings } from './useEnhancedTimerSettings';
import { useNowMs } from './useNowMs';

/** How often the alarms are worked out again with nothing else changing (a summary time passing, a new day). */
export const PLAN_INTERVAL_MS = 60_000;

export function usePhoneReminders({
  sessions,
  tasks,
  ready,
}: {
  sessions: TaskSession[];
  tasks: Task[];
  ready: boolean;
}): void {
  const { schedule, cancel } = getBackend().platform.notifications;
  const [preferences] = useNotificationPreferences();
  const { inactivitySettings } = useEnhancedTimerSettings();
  // A phone's long-run switch is its on and off (Settings → Notifications), so
  // no hours is the default
  const longRunHours = inactivitySettings.longRunHours || DEFAULT_INACTIVITY_SETTINGS.longRunHours;
  const { currentGoal } = useDailyGoals();
  const phone = Boolean(schedule && cancel);
  const nowMs = useNowMs(phone, PLAN_INTERVAL_MS, sessions);

  // Each alarm by its id (null: none wanted)
  const alarms = useMemo((): Array<[number, LaterNotification | null]> | null => {
    if (!phone || !ready) return null;
    const on = (wanted: boolean) => preferences.desktopEnabled && wanted;
    const goal = on(preferences.goalMilestones)
      ? goalMilestoneAlarms({ sessions, tasks, goal: currentGoal, nowMs })
      : GOAL_TIERS.map(() => null);
    return [
      [LONG_RUN_REMINDER_ID, on(preferences.longRunReminder) ? longRunAlarm(sessions, longRunHours, nowMs) : null],
      [
        DAILY_SUMMARY_ID,
        on(preferences.dailySummary)
          ? dailySummaryAlarm({ sessions, tasks, goal: currentGoal, time: preferences.dailySummaryTime, nowMs })
          : null,
      ],
      ...goal.map((alarm, index): [number, LaterNotification | null] => [GOAL_MILESTONE_ID + index, alarm]),
    ];
  }, [phone, ready, preferences, longRunHours, currentGoal, sessions, tasks, nowMs]);

  // What each alarm was last set to, so an unchanged one isn't set again
  const applied = useRef(new Map<number, string>());
  useEffect(() => {
    if (!alarms || !schedule || !cancel) return;
    for (const [id, alarm] of alarms) {
      const key = JSON.stringify(alarm);
      if (applied.current.get(id) === key) continue;
      applied.current.set(id, key);
      const tier = GOAL_TIERS[id - GOAL_MILESTONE_ID];
      const failed = (error: unknown) => console.warn(`Failed to set reminder ${id}:`, error);
      if (alarm) {
        schedule(alarm).then(set => tier && noteGoalAlarm(tier, set ? alarm.atMs : null, Date.now()), failed);
      } else {
        if (tier) noteGoalAlarm(tier, null, Date.now());
        cancel(id).catch(failed);
      }
    }
  }, [alarms, schedule, cancel]);
}
