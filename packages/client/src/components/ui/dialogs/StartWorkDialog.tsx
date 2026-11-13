/**
 * Start Work Dialog
 *
 * Pick an existing task and its timer starts, the same as the tray's Start
 * submenu: it joins the active session (stopping whatever is running),
 * otherwise a new session opens with a running timer. Used by the Sessions
 * page's + button and the tray's "Choose Task…". Tasks are listed favorites
 * first, then most recently used.
 */

import { useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import { orderTasksForStart } from '../../../utils/taskOrdering';
import { TaskSelect } from '../forms/TaskSelect';

/** Rendered while open, so each opening starts with nothing picked. */
interface StartWorkDialogProps {
  onClose: () => void;
  tasks: Task[];
  sessions: TaskSession[];
  onStart: (taskId: string, taskName: string) => Promise<unknown>;
  /** Opens the Tasks page, for when there's nothing to start yet. */
  onAddTask: () => void;
  /** A session is open, so starting switches its task (the toolbar's "Switch task"). */
  switching?: boolean;
}

export function StartWorkDialog({
  onClose,
  tasks,
  sessions,
  onStart,
  onAddTask,
  switching = false,
}: StartWorkDialogProps) {
  const [selectedId, setSelectedId] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const options = useMemo(() => orderTasksForStart(tasks, sessions), [tasks, sessions]);
  // Looked up each render: a pick archived meanwhile is no longer startable
  const selected = options.find(task => task.id === selectedId);

  // Only once a task is picked (Start is disabled until then, and while it starts)
  const start =
    selected &&
    (async () => {
      setIsStarting(true);
      try {
        await onStart(selected.id, selected.name);
        onClose();
      } finally {
        setIsStarting(false);
      }
    });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void start?.();
  };

  const handleAddTask = () => {
    onClose();
    onAddTask();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{switching ? 'Switch task' : 'Start Work'}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          {options.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Add a task on the Tasks page first, then start it here.
            </Typography>
          ) : (
            <Box sx={{ pt: 1 }}>
              <TaskSelect tasks={options} value={selectedId} onChange={task => setSelectedId(task.id)} autoFocus />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="secondary">
            Cancel
          </Button>
          {options.length === 0 ? (
            <Button variant="contained" onClick={handleAddTask}>
              Go to Tasks
            </Button>
          ) : (
            <Button type="submit" variant="contained" disabled={!start || isStarting}>
              Start
            </Button>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
