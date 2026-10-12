import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { Task } from '../../../types/task';
import { formatDuration } from '../../../utils/formatters';

export interface TaskHistory {
  entryCount: number;
  trackedMs: number;
}

interface DeleteTaskDialogProps {
  task: Task | null;
  history: TaskHistory;
  onDelete: (taskId: string) => void;
  /** Offered as the main action when the task has history and isn't archived. */
  onArchive?: (taskId: string) => void;
  onClose: () => void;
}

/**
 * Deleting a task leaves its sessions in place (they live in the backend's
 * sessions.json), but they lose the task's hourly rate, so their earnings
 * show as $0. When that history exists, say so and offer Archive, which keeps
 * the rate and hides the task from pickers.
 */
export function DeleteTaskDialog({ task, history, onDelete, onArchive, onClose }: DeleteTaskDialogProps) {
  if (!task) return null;

  const hasHistory = history.entryCount > 0;
  const canArchive = hasHistory && !task.isArchived && !!onArchive;
  const entries = `${history.entryCount} time entr${history.entryCount === 1 ? 'y' : 'ies'}`;

  const message = hasHistory
    ? `"${task.name}" has ${entries} (${formatDuration(history.trackedMs)}). They stay in your ` +
      'history, but without the task they lose its hourly rate, so their earnings show as $0.' +
      (canArchive ? ' Archive it instead to keep the rate and hide it from task pickers.' : '')
    : `Delete "${task.name}"? This can't be undone.`;

  const handleDelete = () => {
    onDelete(task.id);
    onClose();
  };

  const handleArchive = () => {
    onArchive?.(task.id);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete Task</DialogTitle>
      <DialogContent>
        <Alert severity={hasHistory ? 'warning' : 'error'}>
          <DialogContentText component="div">{message}</DialogContentText>
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary">
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          color="error"
          variant={canArchive ? 'outlined' : 'contained'}
        >
          {canArchive ? 'Delete anyway' : 'Delete'}
        </Button>
        {canArchive && (
          <Button onClick={handleArchive} variant="contained" autoFocus>
            Archive instead
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
