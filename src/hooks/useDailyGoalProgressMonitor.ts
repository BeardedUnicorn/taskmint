/**
 * Daily Goal Progress Monitor Hook
 * 
 * Monitors daily earnings progress and triggers notifications at key milestones
 * Handles desktop notifications and progress tracking for daily goals
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useDailyGoals } from './useDailyGoals';
import { TimeEntry } from '../types/timer';
import { Task } from '../types/task';
import { calculateTotalEarningsForDate, getTodayDateString } from '../utils/earningsCalculator';

// Desktop notification functions - only available in Tauri environment
let sendNotification: ((options: { title: string; body: string }) => Promise<void>) | null = null;
let isPermissionGranted: (() => Promise<boolean>) | null = null;
let requestPermission: (() => Promise<boolean>) | null = null;

// Dynamically import Tauri notification API if available
if (typeof window !== 'undefined' && (window as any).__TAURI__) {
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
  timeEntries: TimeEntry[];
  tasks: Task[];
}

export interface DailyGoalProgressData {
  currentEarnings: number;
  targetAmount: number;
  currency: string;
  percentageAchieved: number;
  isGoalEnabled: boolean;
  status: 'on-track' | 'behind' | 'achieved' | 'exceeded';
  remainingAmount: number;
}

export function useDailyGoalProgressMonitor({
  timeEntries,
  tasks,
}: UseDailyGoalProgressMonitorProps) {
  const { currentGoal, updateNotificationState, recordAchievement } = useDailyGoals();

  /**
   * Helper function to trigger desktop notifications
   */
  const triggerDesktopNotification = useCallback(async (title: string, body: string) => {
    // Only proceed if running in Tauri environment
    if (!sendNotification || !isPermissionGranted || !requestPermission) {
      console.log('Desktop notifications not available:', { title, body });
      return;
    }

    try {
      // Check if permission is already granted
      let hasPermission = await isPermissionGranted();
      
      // Request permission if not granted
      if (!hasPermission) {
        hasPermission = await requestPermission();
      }

      // Send notification if permission granted
      if (hasPermission) {
        await sendNotification({ title, body });
        console.log('Desktop notification sent:', { title, body });
      } else {
        console.warn('Desktop notification permission denied');
      }
    } catch (error) {
      console.error('Failed to send desktop notification:', error);
    }
  }, []);

  /**
   * Calculate current day's progress
   */
  const currentProgress = useMemo((): DailyGoalProgressData => {
    const today = getTodayDateString();
    const currentEarnings = calculateTotalEarningsForDate(today, timeEntries, tasks);
    
    if (!currentGoal || !currentGoal.isEnabled || currentGoal.targetAmount <= 0) {
      return {
        currentEarnings,
        targetAmount: 0,
        currency: 'USD',
        percentageAchieved: 0,
        isGoalEnabled: false,
        status: 'on-track',
        remainingAmount: 0,
      };
    }

    const percentageAchieved = (currentEarnings / currentGoal.targetAmount) * 100;
    const remainingAmount = Math.max(0, currentGoal.targetAmount - currentEarnings);
    
    let status: 'on-track' | 'behind' | 'achieved' | 'exceeded';
    if (percentageAchieved >= 100) {
      status = percentageAchieved > 100 ? 'exceeded' : 'achieved';
    } else if (percentageAchieved >= 75) {
      status = 'on-track';
    } else {
      status = 'behind';
    }

    return {
      currentEarnings,
      targetAmount: currentGoal.targetAmount,
      currency: currentGoal.currency,
      percentageAchieved,
      isGoalEnabled: true,
      status,
      remainingAmount,
    };
  }, [timeEntries, tasks, currentGoal]);

  /**
   * Handle progress monitoring and notifications
   */
  useEffect(() => {
    if (!currentGoal || !currentGoal.isEnabled || currentGoal.targetAmount <= 0) {
      return;
    }

    const today = getTodayDateString();
    const { percentageAchieved, currentEarnings, targetAmount } = currentProgress;

    // Reset notification state if it's a new day
    if (currentGoal.lastNotificationDate !== today) {
      updateNotificationState(0, today);
      return; // Exit early to avoid notifications on the first check of a new day
    }

    // Check for notification triggers
    const checkNotifications = async () => {
      try {
        // 50% milestone
        if (percentageAchieved >= 50 && currentGoal.lastNotifiedPercent < 50) {
          await triggerDesktopNotification(
            'Halfway to your goal!',
            `You've earned $${currentEarnings.toFixed(2)} of your $${targetAmount.toFixed(2)} daily target. Keep up the great work!`
          );
          await updateNotificationState(50, today);
        }
        // 75% milestone
        else if (percentageAchieved >= 75 && currentGoal.lastNotifiedPercent < 75) {
          await triggerDesktopNotification(
            "You're 75% there!",
            `You've earned $${currentEarnings.toFixed(2)} of your $${targetAmount.toFixed(2)} daily target. Almost at your goal!`
          );
          await updateNotificationState(75, today);
        }
        // 100% milestone
        else if (percentageAchieved >= 100 && currentGoal.lastNotifiedPercent < 100) {
          await triggerDesktopNotification(
            'Goal Achieved!',
            `Fantastic job! You've reached your daily target of $${targetAmount.toFixed(2)}!`
          );
          await updateNotificationState(100, today);
        }
        // Exceeded milestone (only trigger once when crossing 100%)
        else if (percentageAchieved > 100 && currentGoal.lastNotifiedPercent === 100) {
          await triggerDesktopNotification(
            'Goal CRUSHED!',
            `Amazing! You've exceeded your daily target by $${(currentEarnings - targetAmount).toFixed(2)}. You're on fire today!`
          );
          await updateNotificationState(101, today);
        }
      } catch (error) {
        console.error('Error checking notifications:', error);
      }
    };

    checkNotifications();
  }, [currentProgress, currentGoal, triggerDesktopNotification, updateNotificationState]);

  /**
   * Handle daily achievement recording when day changes
   */
  useEffect(() => {
    if (!currentGoal || !currentGoal.isEnabled) {
      return;
    }

    const today = getTodayDateString();
    
    // Check if we need to record yesterday's achievement
    if (currentGoal.lastNotificationDate && currentGoal.lastNotificationDate !== today) {
      const yesterday = currentGoal.lastNotificationDate;
      const yesterdayEarnings = calculateTotalEarningsForDate(yesterday, timeEntries, tasks);
      
      if (currentGoal.targetAmount > 0) {
        const percentageAchieved = (yesterdayEarnings / currentGoal.targetAmount) * 100;
        const difference = yesterdayEarnings - currentGoal.targetAmount;
        
        let status: 'hit' | 'missed' | 'exceeded';
        if (percentageAchieved >= 100) {
          status = percentageAchieved > 100 ? 'exceeded' : 'hit';
        } else {
          status = 'missed';
        }

        // Record the achievement for yesterday
        recordAchievement({
          date: yesterday,
          goalAmount: currentGoal.targetAmount,
          earnedAmount: yesterdayEarnings,
          currency: currentGoal.currency,
          percentageAchieved,
          status,
          difference,
        }).catch((error) => {
          console.error('Failed to record daily achievement:', error);
        });
      }

      // Reset notification state for the new day
      updateNotificationState(0, today);
    }
  }, [currentGoal, timeEntries, tasks, recordAchievement, updateNotificationState]);

  return {
    currentProgress,
    isGoalEnabled: currentGoal?.isEnabled || false,
    hasActiveGoal: !!(currentGoal && currentGoal.isEnabled && currentGoal.targetAmount > 0),
  };
}
