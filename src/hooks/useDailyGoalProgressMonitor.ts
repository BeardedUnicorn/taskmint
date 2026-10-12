/**
 * Daily Goal Progress Monitor Hook
 *
 * Today's earnings against the daily goal, live: computed from the sessions
 * (including a running timer) with the shared earnings rules, ticking while a
 * timer runs. Sends the 50% / 75% / 100% / exceeded notifications as they're
 * crossed, and saves today's target so the day keeps it if the goal changes
 * later. Used once, in App; the sidebar shows the progress it returns.
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useDailyGoals } from './useDailyGoals';
import { TaskSession, TimerState } from '../types/timer';
import { Task } from '../types/task';
import { earningsOnDate } from '../utils/earnings';
import { formatDateString } from '../utils/dateHelpers';
import { isTauriEnvironment } from '../utils/tauri';

/** How often today's total refreshes while a timer runs. */
const LIVE_TICK_MS = 10_000;

// Desktop notification functions - only available in Tauri environment
let sendNotification: ((options: { title: string; body: string }) => Promise<void>) | null = null;
let isPermissionGranted: (() => Promise<boolean>) | null = null;
let requestPermission: (() => Promise<boolean>) | null = null;

// Dynamically import Tauri notification API if available.
// isTauriEnvironment() also accepts __TAURI_INTERNALS__ — window.__TAURI__
// alone is only defined with app.withGlobalTauri, which this app doesn't set.
if (isTauriEnvironment()) {
  // Try to import notification API - handle both v1 and v2 API paths
  Promise.resolve().then(async () => {
    try {
      // Try Tauri v2 plugin API first
      const { sendNotification: send, isPermissionGranted: isGranted, requestPermission: request } = await import('@tauri-apps/plugin-notification');

      // Wrap the functions to match our expected interface
      sendNotification = async (options: { title: string; body: string }) => {
        await send(options);
      };

      isPermissionGranted = isGranted;

      requestPermission = async () => {
        const permission = await request();
        return permission === 'granted';
      };
    } catch (error) {
      console.warn('Failed to load Tauri notification plugin:', error);
      // Fallback to browser notifications if available
      if ('Notification' in window) {
        sendNotification = async (options: { title: string; body: string }) => {
          new Notification(options.title, { body: options.body });
        };
        isPermissionGranted = async () => Notification.permission === 'granted';
        requestPermission = async () => {
          const permission = await Notification.requestPermission();
          return permission === 'granted';
        };
      }
    }
  });
}

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

export function useDailyGoalProgressMonitor({
  sessions,
  tasks,
}: UseDailyGoalProgressMonitorProps): DailyGoalProgressData {
  const { currentGoal, achievements, updateNotificationState, recordAchievement } = useDailyGoals();

  // Today's total only moves while a timer runs; otherwise it changes with
  // the sessions themselves (stops, edits, Add time, imports).
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasRunningTimer = sessions.some(session =>
    session.timerInstances?.some(instance => instance.state === TimerState.running)
  );
  useEffect(() => {
    setNowMs(Date.now());
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setNowMs(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(interval);
  }, [hasRunningTimer, sessions]);

  const today = formatDateString(new Date(nowMs));

  /**
   * Helper function to trigger desktop notifications
   */
  const triggerDesktopNotification = useCallback(async (title: string, body: string) => {
    if (!sendNotification || !isPermissionGranted || !requestPermission) {
      return;
    }

    try {
      let hasPermission = await isPermissionGranted();
      if (!hasPermission) {
        hasPermission = await requestPermission();
      }
      if (hasPermission) {
        await sendNotification({ title, body });
      } else {
        console.warn('Desktop notification permission denied');
      }
    } catch (error) {
      console.error('Failed to send desktop notification:', error);
    }
  }, []);

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

  // Milestone notifications, as each one is crossed
  useEffect(() => {
    if (!currentGoal || !progress.enabled) return;

    // New day: start over (no notification on this first check)
    if (currentGoal.lastNotificationDate !== today) {
      void updateNotificationState(0, today);
      return;
    }

    const { percent, earned, target } = progress;
    const notify = async () => {
      try {
        if (percent >= 50 && currentGoal.lastNotifiedPercent < 50 && percent < 75) {
          await triggerDesktopNotification(
            'Halfway to your goal!',
            `You've earned $${earned.toFixed(2)} of your $${target.toFixed(2)} daily target. Keep up the great work!`
          );
          await updateNotificationState(50, today);
        } else if (percent >= 75 && currentGoal.lastNotifiedPercent < 75 && percent < 100) {
          await triggerDesktopNotification(
            "You're 75% there!",
            `You've earned $${earned.toFixed(2)} of your $${target.toFixed(2)} daily target. Almost at your goal!`
          );
          await updateNotificationState(75, today);
        } else if (percent >= 100 && currentGoal.lastNotifiedPercent < 100) {
          await triggerDesktopNotification(
            'Goal Achieved!',
            `Fantastic job! You've reached your daily target of $${target.toFixed(2)}!`
          );
          await updateNotificationState(100, today);
        } else if (percent > 100 && currentGoal.lastNotifiedPercent === 100) {
          await triggerDesktopNotification(
            'Goal CRUSHED!',
            `Amazing! You've exceeded your daily target by $${(earned - target).toFixed(2)}. You're on fire today!`
          );
          await updateNotificationState(101, today);
        }
      } catch (error) {
        console.error('Error checking notifications:', error);
      }
    };
    void notify();
  }, [progress, currentGoal, today, triggerDesktopNotification, updateNotificationState]);

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
