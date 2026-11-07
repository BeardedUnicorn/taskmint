/**
 * Add Timer Dialog
 *
 * Which task a new timer in the active session is for. The session's latest
 * task starts picked, so another timer on the same work is one click. The
 * timer arrives idle: adding one never disturbs what's running.
 */

import { useMemo, useState } from 'react';
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import { orderTasksForStart } from '../../../utils/taskOrdering';
import { instanceTaskId } from '../../../utils/timerHelpers';

/** The task the session's newest timer is on, else the session's own. */
function latestTaskId(session: TaskSession): string {
  const latest = session.timerInstances.at(-1);
  return latest ? instanceTaskId(latest, session) : session.taskId;
}

/** Rendered while open, so each opening starts from the session's latest task. */
interface AddTimerDialogProps {
  session: TaskSession;
  tasks: Task[];
  sessions: TaskSession[];
  onClose: () => void;
  /** Reports its own failures, so it never rejects. */
  onAdd: (task: Task) => Promise<unknown>;
}

export function AddTimerDialog({ session, tasks, sessions, onClose, onAdd }: AddTimerDialogProps) {
  const options = useMemo(() => orderTasksForStart(tasks, sessions), [tasks, sessions]);
  const [selected, setSelected] = useState<Task | null>(
    () => options.find(task => task.id === latestTaskId(session)) ?? null
  );
  const [isAdding, setIsAdding] = useState(false);

  const add =
    selected &&
    (async () => {
      setIsAdding(true);
      await onAdd(selected);
      onClose();
    });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void add?.();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Timer</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1 }}>
          <Autocomplete
            options={options}
            value={selected}
            onChange={(_, task) => setSelected(task)}
            getOptionLabel={(task) => (task.isFavorite ? `★ ${task.name}` : task.name)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            sx={{ pt: 1 }}
            renderInput={(params) => (
              <TextField {...params} autoFocus label="Task" placeholder="Choose a task…" />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="secondary">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!add || isAdding}>
            Add Timer
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
