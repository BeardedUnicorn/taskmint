import { ReactNode } from 'react';
import { DailyGoalContext, useDailyGoalsState } from '../hooks/useDailyGoals';

/**
 * Holds the one copy of the daily goal state that the goal monitor, Settings
 * and Reports all read (via useDailyGoals).
 */
export function DailyGoalProvider({ children }: { children: ReactNode }) {
  const dailyGoals = useDailyGoalsState();
  return <DailyGoalContext.Provider value={dailyGoals}>{children}</DailyGoalContext.Provider>;
}
