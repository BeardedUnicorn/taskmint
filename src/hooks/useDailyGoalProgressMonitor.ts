/**
 * Daily Goal Progress Monitor Hook
 *
 * Today's earnings against the daily goal, live: computed from the sessions
 * (including a running timer) with the shared earnings rules, ticking while a
 * timer runs. Sends the 50% / 75% / 100% / exceeded notifications as they're
 * crossed, and saves today's target so the day keeps it if the goal changes
 * later. Used once, in App; the sidebar shows the progress it returns.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useDailyGoals } from './useDailyGoals';
import { TaskSession } from '../types/timer';
import { hasRunningTimer } from '../utils/timerHelpers';
import { useNowMs } from './useNowMs';
import { Task } from '../types/task';
import { earningsOnDate } from '../utils/earnings';
import { formatDateString } from '../utils/dateHelpers';
import { notifyDesktop } from '../utils/desktopNotification';
import { formatCurrency } from '../utils/formatters';

/** How often today's total refreshes while a timer runs. */
const LIVE_TICK_MS = 10_000;

export interface UseDailyGoalProgressMonitorProps {
  sessions: TaskSession[];
  tasks: Task[];
}

export interface DailyGoalProgressData {
  /** A goal is enabled with a target above zero. */
  enabled: boolean;
  earned: number;
  target: number;
  percent: number;
  currency: string;
}

/** Stored tier once the goal is beaten by a wide margin (older builds stored 101). */
export const EXCEEDED_TIER = 125;

export interface GoalMilestone {
  tier: number;
  title: string;
  body: string;
}

/**
 * The milestone to announce now, if any: the highest tier reached that is
 * above the last one announced today. Jumping straight past several tiers
 * sends only the highest (and reaching 100% and 125% at once sends only
 * "achieved", so "crushed" doesn't follow a second later).
 */
export function nextGoalMilestone(
  progress: Pick<DailyGoalProgressData, 'percent' | 'earned' | 'target' | 'currency'>,
  lastNotifiedPercent: number
): GoalMilestone | null {
  const last = lastNotifiedPercent > 100 ? EXCEEDED_TIER : lastNotifiedPercent;
  const { percent, earned, target, currency } = progress;
  const money = (amount: number) => formatCurrency(amount, currency);

  if (percent >= 100 && last < 100) {
    return {
      tier: percent >= EXCEEDED_TIER ? EXCEEDED_TIER : 100,
      title: 'Goal Achieved!',
      body: `Fantastic job! You've reached your daily target of ${money(target)}!`,
    };
  }
  if (percent >= EXCEEDED_TIER && last < EXCEEDED_TIER) {
    return {
      tier: EXCEEDED_TIER,
      title: 'Goal CRUSHED!',
      body: `Amazing! You've exceeded your daily target by ${money(earned - target)}. You're on fire today!`,
    };
  }
  if (percent >= 75 && percent < 100 && last < 75) {
    return {
      tier: 75,
      title: "You're 75% there!",
      body: `You've earned ${money(earned)} of your ${money(target)} daily target. Almost at your goal!`,
    };
  }
  if (percent >= 50 && percent < 75 && last < 50) {
    return {
      tier: 50,
      title: 'Halfway to your goal!',
      body: `You've earned ${money(earned)} of your ${money(target)} daily target. Keep up the great work!`,
    };
  }
  return null;
}

export function useDailyGoalProgressMonitor({
  sessions,
  tasks,
}: UseDailyGoalProgressMonitorProps): DailyGoalProgressData {
  const { currentGoal, achievements, updateNotificationState, recordAchievement } = useDailyGoals();

  // Today's total only moves while a timer runs; otherwise it changes with
  // the sessions themselves (stops, edits, Add time, imports).
  const nowMs = useNowMs(hasRunningTimer(sessions), LIVE_TICK_MS, sessions);

  const today = formatDateString(new Date(nowMs));

  const progress = useMemo((): DailyGoalProgressData => {
    const earned = earningsOnDate(sessions, tasks, today, nowMs);
    const enabled = !!currentGoal?.isEnabled && (currentGoal?.targetAmount ?? 0) > 0;
    const target = enabled ? currentGoal!.targetAmount : 0;
    return {
      enabled,
      earned,
      target,
      percent: enabled ? (earned / target) * 100 : 0,
      currency: currentGoal?.currency ?? 'USD',
    };
  }, [sessions, tasks, today, nowMs, currentGoal]);

  // Milestone notifications, as each one is crossed. The tier being sent is
  // remembered synchronously, so a re-run while the first send is still
  // awaiting (the live tick, a session change) can't send it twice.
  const sendingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentGoal || !progress.enabled) return;

    // New day: start over (no notification on this first check)
    if (currentGoal.lastNotificationDate !== today) {
      void updateNotificationState(0, today);
      return;
    }

    const milestone = nextGoalMilestone(progress, currentGoal.lastNotifiedPercent);
    if (!milestone) return;
    const key = `${today}:${milestone.tier}`;
    if (sendingRef.current === key) return;
    sendingRef.current = key;

    void (async () => {
      try {
        await notifyDesktop(milestone.title, milestone.body, 'goalMilestone');
        await updateNotificationState(milestone.tier, today);
      } catch (error) {
        console.error('Error sending the goal notification:', error);
      }
    })();
  }, [progress, currentGoal, today, updateNotificationState]);

  // Save today's target (again if it changes today), so later goal changes
  // don't rewrite what this day was measured against.
  useEffect(() => {
    if (!progress.enabled) return;
    const saved = achievements.find(record => record.date === today);
    if (saved && saved.goalAmount === progress.target) return;
    const percentageAchieved = progress.percent;
    void recordAchievement({
      date: today,
      goalAmount: progress.target,
      earnedAmount: Math.round(progress.earned * 100) / 100,
      currency: progress.currency,
      percentageAchieved,
      status: percentageAchieved > 100 ? 'exceeded' : percentageAchieved >= 100 ? 'hit' : 'missed',
      difference: progress.earned - progress.target,
    }).catch(error => console.error('Failed to save today\'s goal:', error));
    // Keyed on the target and day only: the saved earned amount is
    // informational (Reports recomputes it), so it isn't re-saved every tick.
  }, [progress.enabled, progress.target, today, achievements, recordAchievement]);

  return progress;
}
