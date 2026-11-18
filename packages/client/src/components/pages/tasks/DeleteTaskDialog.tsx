import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
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
  onArchive: (taskId: string) => void;
  onClose: () => void;
}

/**
 * Deleting a task leaves its tracked time in place, earnings included: each
 * session and timer keeps the name and the rate captured for it
 * (utils/earnings). What goes is the task itself, and with it this page's
 * list of that time. When there is such history, say so and offer Archive,
 * which keeps the task and hides it from pickers.
 */
export function DeleteTaskDialog({ task, history, onDelete, onArchive, onClose }: DeleteTaskDialogProps) {
  if (!task) return null;

  const hasHistory = history.entryCount > 0;
  const canArchive = hasHistory && !task.isArchived;
  const entries = `${history.entryCount} time entr${history.entryCount === 1 ? 'y' : 'ies'}`;

  const message = hasHistory
    ? `"${task.name}" has ${entries} (${formatDuration(history.trackedMs)}). They stay in your ` +
      'history and keep their earnings, but are no longer listed under a task here.' +
      (canArchive ? ' Archive it instead to keep it, hidden from task pickers.' : '')
    : `Delete "${task.name}"?`;

  const handleDelete = () => {
    onDelete(task.id);
    onClose();
  };

  const handleArchive = () => {
    onArchive(task.id);
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
        <Button onClick={handleDelete} color="error" variant={canArchive ? 'outlined' : 'contained'}>
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
