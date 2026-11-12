import { useDailyGoalProgress } from '../../contexts/DailyGoalProgressContext';
import { GoalProgress } from './GoalProgress';

/** The sidebar's goal footer: today's progress, live (see DailyGoalProgressContext). */
export function GoalFooter({ collapsed }: { collapsed: boolean }) {
  return <GoalProgress progress={useDailyGoalProgress()} collapsed={collapsed} />;
}
