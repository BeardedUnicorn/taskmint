import { ReactNode, useId } from 'react';
import {
  Box,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  SxProps,
  Theme,
  Typography,
} from '@mui/material';
import { Task } from '../../../types/task';
import { formatCurrency } from '../../../utils/formatters';
import { PHONE } from '../../../theme/media';

interface TaskSelectProps {
  /** The tasks to offer, in the order to list them. */
  tasks: Task[];
  /** The chosen task's id; '' (or an id not among `tasks`) for none. */
  value: string;
  onChange: (task: Task) => void;
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
  helperText?: ReactNode;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

function TaskName({ task }: { task: Task }) {
  return (
    <>
      {task.isFavorite && (
        <Box component="span" sx={{ color: 'warning.main', mr: 0.75 }}>
          ★
        </Box>
      )}
      {task.name}
    </>
  );
}

/**
 * A plain dropdown of tasks: tasks are added on the Tasks page, so there's
 * nothing to type here. Favorites are starred, and each task's hourly rate
 * shows in the list.
 */
export function TaskSelect({
  tasks,
  value,
  onChange,
  label = 'Task',
  disabled,
  autoFocus,
  error,
  helperText,
  size,
  sx,
}: TaskSelectProps) {
  const labelId = useId();
  const byId = new Map(tasks.map(task => [task.id, task]));
  // Showing an id that isn't listed would make MUI warn, and show nothing anyway
  const selectedId = byId.has(value) ? value : '';

  return (
    <FormControl fullWidth size={size} disabled={disabled} error={error} sx={sx}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={selectedId}
        autoFocus={autoFocus}
        // Every listed value is a task's id; the field shows just its name
        onChange={event => onChange(byId.get(event.target.value)!)}
        renderValue={id => <TaskName task={byId.get(id)!} />}
      >
        {tasks.map(task => (
          // On a phone a long name wraps rather than pushing the rate out of the menu
          <MenuItem key={task.id} value={task.id} sx={{ gap: 2, [PHONE]: { whiteSpace: 'normal' } }}>
            <Box sx={{ flex: 1, [PHONE]: { minWidth: 0, overflowWrap: 'anywhere' } }}>
              <TaskName task={task} />
            </Box>
            {task.hourlyRate ? (
              <Typography variant="body2" color="text.secondary" sx={{ [PHONE]: { flexShrink: 0 } }}>
                {formatCurrency(task.hourlyRate)}/hr
              </Typography>
            ) : null}
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}
