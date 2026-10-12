/**
 * Daily Goals Hook
 *
 * Manages the daily earnings goal and the per-day goal records, persisted in
 * localStorage. The state lives in ONE place (DailyGoalProvider) and every
 * consumer reads it through useDailyGoals(): separate copies used to drift,
 * and the goal monitor writing back its stale copy could revert a target
 * just saved in Settings.
 *
 * Day records keep the target that applied that day; the earned amount is
 * recomputed live from tracked time (utils/goalHistory), so edits and imports
 * correct past days.
 */

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { DailyGoal, DailyGoalAchievement } from '../types/goal';

const DEFAULT_DAILY_GOAL: DailyGoal = {
  targetAmount: 0,
  currency: 'USD',
  isEnabled: false,
  lastNotifiedPercent: 0,
  lastNotificationDate: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export interface UseDailyGoalsReturn {
  // Current goal state
  currentGoal: DailyGoal | null;
  achievements: DailyGoalAchievement[];
  
  // Goal management functions
  getCurrentGoal(): DailyGoal | null;
  updateDailyGoal(goalData: Partial<Omit<DailyGoal, 'createdAt' | 'updatedAt' | 'lastNotifiedPercent' | 'lastNotificationDate'>>): Promise<void>;
  enableDailyGoal(isEnabled: boolean): Promise<void>;
  
  // Achievement management functions
  getAchievementsForDateRange(startDate: string, endDate: string): Promise<DailyGoalAchievement[]>;
  recordAchievement(achievementData: Omit<DailyGoalAchievement, 'id' | 'recordedAt'>): Promise<DailyGoalAchievement>;
  
  // Notification state management
  updateNotificationState(percent: number, date: string): Promise<void>;
}

/** The single shared goal state; provided by DailyGoalProvider. */
export const DailyGoalContext = createContext<UseDailyGoalsReturn | null>(null);

export function useDailyGoals(): UseDailyGoalsReturn {
  const context = useContext(DailyGoalContext);
  if (!context) {
    throw new Error('useDailyGoals must be used within a DailyGoalProvider');
  }
  return context;
}

/** The goal state itself. Use once, in DailyGoalProvider. */
export function useDailyGoalsState(): UseDailyGoalsReturn {
  const [currentGoal, setCurrentGoal] = useLocalStorage<DailyGoal | null>(
    STORAGE_KEYS.DAILY_GOAL,
    null
  );
  
  const [achievements, setAchievements] = useLocalStorage<DailyGoalAchievement[]>(
    STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS,
    []
  );

  const getCurrentGoal = useCallback((): DailyGoal | null => {
    return currentGoal;
  }, [currentGoal]);

  const updateDailyGoal = useCallback(async (
    goalData: Partial<Omit<DailyGoal, 'createdAt' | 'updatedAt' | 'lastNotifiedPercent' | 'lastNotificationDate'>>
  ): Promise<void> => {
    const now = new Date().toISOString();
    
    if (currentGoal) {
      // Update existing goal
      const updatedGoal: DailyGoal = {
        ...currentGoal,
        ...goalData,
        updatedAt: now,
      };
      setCurrentGoal(updatedGoal);
    } else {
      // Create new goal
      const newGoal: DailyGoal = {
        ...DEFAULT_DAILY_GOAL,
        ...goalData,
        createdAt: now,
        updatedAt: now,
      };
      setCurrentGoal(newGoal);
    }
  }, [currentGoal, setCurrentGoal]);

  const enableDailyGoal = useCallback(async (isEnabled: boolean): Promise<void> => {
    if (currentGoal) {
      const updatedGoal: DailyGoal = {
        ...currentGoal,
        isEnabled,
        updatedAt: new Date().toISOString(),
      };
      setCurrentGoal(updatedGoal);
    } else if (isEnabled) {
      // Create a new goal if enabling and no goal exists
      const now = new Date().toISOString();
      const newGoal: DailyGoal = {
        ...DEFAULT_DAILY_GOAL,
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      };
      setCurrentGoal(newGoal);
    }
  }, [currentGoal, setCurrentGoal]);

  const getAchievementsForDateRange = useCallback(async (
    startDate: string,
    endDate: string
  ): Promise<DailyGoalAchievement[]> => {
    return achievements.filter(achievement => 
      achievement.date >= startDate && achievement.date <= endDate
    );
  }, [achievements]);

  const recordAchievement = useCallback(async (
    achievementData: Omit<DailyGoalAchievement, 'id' | 'recordedAt'>
  ): Promise<DailyGoalAchievement> => {
    const now = new Date().toISOString();
    const newAchievement: DailyGoalAchievement = {
      ...achievementData,
      id: `achievement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recordedAt: now,
    };

    // Check if achievement for this date already exists
    const existingIndex = achievements.findIndex(a => a.date === achievementData.date);
    
    if (existingIndex >= 0) {
      // Update existing achievement
      const updatedAchievements = [...achievements];
      updatedAchievements[existingIndex] = newAchievement;
      setAchievements(updatedAchievements);
    } else {
      // Add new achievement
      setAchievements([...achievements, newAchievement]);
    }

    return newAchievement;
  }, [achievements, setAchievements]);

  const updateNotificationState = useCallback(async (
    percent: number,
    date: string
  ): Promise<void> => {
    if (currentGoal) {
      const updatedGoal: DailyGoal = {
        ...currentGoal,
        lastNotifiedPercent: percent,
        lastNotificationDate: date,
        updatedAt: new Date().toISOString(),
      };
      setCurrentGoal(updatedGoal);
    }
  }, [currentGoal, setCurrentGoal]);

  return useMemo(() => ({
    currentGoal,
    achievements,
    getCurrentGoal,
    updateDailyGoal,
    enableDailyGoal,
    getAchievementsForDateRange,
    recordAchievement,
    updateNotificationState,
  }), [
    currentGoal,
    achievements,
    getCurrentGoal,
    updateDailyGoal,
    enableDailyGoal,
    getAchievementsForDateRange,
    recordAchievement,
    updateNotificationState,
  ]);
}
