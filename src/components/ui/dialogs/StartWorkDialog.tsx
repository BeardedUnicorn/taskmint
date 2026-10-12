/**
 * Start Work Dialog
 *
 * Pick an existing task and its timer starts, the same as the tray's Start
 * submenu: the task's active session continues, otherwise a new session opens
 * with a running timer. Used by the Sessions page's + button and the tray's
 * "Choose Task…". Tasks are listed favorites first, then most recently used.
 */

import { useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import { orderTasksForStart } from '../../../utils/taskOrdering';
import { formatCurrency } from '../../../utils/formatters';

interface StartWorkDialogProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  sessions: TaskSession[];
  onStart: (taskId: string, taskName: string) => Promise<unknown>;
  /** Opens the Tasks page, for when there's nothing to start yet. */
  onAddTask: () => void;
}

export function StartWorkDialog({
  open,
  onClose,
  tasks,
  sessions,
  onStart,
  onAddTask,
}: StartWorkDialogProps) {
  const [selected, setSelected] = useState<Task | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const options = useMemo(() => orderTasksForStart(tasks, sessions), [tasks, sessions]);

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const handleStart = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!selected || isStarting) return;
    setIsStarting(true);
    try {
      await onStart(selected.id, selected.name);
      handleClose();
    } finally {
      setIsStarting(false);
    }
  };

  const handleAddTask = () => {
    handleClose();
    onAddTask();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start Work</DialogTitle>
      <form onSubmit={handleStart}>
        <DialogContent>
          {options.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Add a task on the Tasks page first, then start it here.
            </Typography>
          ) : (
            <Box sx={{ pt: 1 }}>
              <Autocomplete
                options={options}
                value={selected}
                onChange={(_, task) => setSelected(task)}
                getOptionLabel={(task) => task.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                openOnFocus
                renderOption={(props, task) => {
                  const { key, ...optionProps } = props;
                  return (
                    <Box component="li" key={key} {...optionProps}>
                      <Box sx={{ display: 'flex', width: '100%', gap: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          {task.isFavorite && (
                            <Box component="span" aria-label="Favorite" sx={{ color: 'warning.main', mr: 0.75 }}>
                              ★
                            </Box>
                          )}
                          {task.name}
                        </Box>
                        {task.hourlyRate ? (
                          <Typography variant="body2" color="text.secondary">
                            {formatCurrency(task.hourlyRate)}/hr
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>
                  );
                }}
                renderInput={(params) => (
                  <TextField {...params} autoFocus label="Task" placeholder="Choose a task…" />
                )}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="secondary">
            Cancel
          </Button>
          {options.length === 0 ? (
            <Button variant="contained" onClick={handleAddTask}>
              Go to Tasks
            </Button>
          ) : (
            <Button type="submit" variant="contained" disabled={!selected || isStarting}>
              Start
            </Button>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
