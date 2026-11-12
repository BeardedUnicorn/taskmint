/**
 * Today's progress toward the daily goal, for the sidebar's footer and the
 * Home page. The provider is the goal monitor's one home: it runs whatever
 * is on screen (on a phone the sidebar is a menu that's usually closed),
 * and one instance means each milestone notifies once. Its live tick
 * re-renders only what reads the progress.
 */

import { createContext, ReactNode, useContext } from 'react';
import { useSessionManagementContext } from './SessionManagementContext';
import { useTaskManagementContext } from './TaskManagementContext';
import { DailyGoalProgressData, useDailyGoalProgressMonitor } from '../hooks/useDailyGoalProgressMonitor';

/** Exported for tests, to provide progress without the monitor behind it. */
export const DailyGoalProgressContext = createContext<DailyGoalProgressData | null>(null);

export function DailyGoalProgressProvider({ children }: { children: ReactNode }) {
  const { sessions } = useSessionManagementContext();
  const { tasks } = useTaskManagementContext();
  const progress = useDailyGoalProgressMonitor({ sessions, tasks });
  return <DailyGoalProgressContext.Provider value={progress}>{children}</DailyGoalProgressContext.Provider>;
}

export function useDailyGoalProgress(): DailyGoalProgressData {
  const progress = useContext(DailyGoalProgressContext);
  if (!progress) {
    throw new Error('useDailyGoalProgress must be used within a DailyGoalProgressProvider');
  }
  return progress;
}
