import { useSessionManagementContext } from '../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { useDailyGoalProgressMonitor } from '../../hooks/useDailyGoalProgressMonitor';
import { GoalProgress } from './GoalProgress';

/**
 * The sidebar's goal footer, and the home of the goal monitor (live progress
 * plus milestone notifications). Kept in this leaf so the monitor's live tick
 * re-renders only the footer, not the whole app.
 */
export function GoalFooter({ collapsed }: { collapsed: boolean }) {
  const { sessions } = useSessionManagementContext();
  const { tasks } = useTaskManagementContext();
  const progress = useDailyGoalProgressMonitor({ sessions, tasks });
  return <GoalProgress progress={progress} collapsed={collapsed} />;
}
