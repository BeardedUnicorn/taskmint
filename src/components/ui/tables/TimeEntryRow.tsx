
import { TableRow, TableCell, Typography } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TimeEntryRowProps } from '../../../types/table';
import { ActionButton } from '../buttons/ActionButton';
import { EarningsDisplay } from '../display/EarningsDisplay';
import { formatDuration } from '../../../utils/formatters';
import { formatLocalTime } from '../../../utils/dateHelpers';

/**
 * Table row component for displaying time entry data
 * Includes edit and delete actions with earnings calculation
 */
export function TimeEntryRow({
  entry,
  tasks,
  onEdit,
  onDelete,
  showEarnings = true,
  sx,
}: TimeEntryRowProps) {
  const getTaskById = (taskId?: string) => {
    if (!taskId) return undefined;
    return tasks.find(task => task.id === taskId);
  };

  const getTaskByName = (taskName: string) => {
    return tasks.find(task => task.name === taskName);
  };

  const calculateEarnings = (): number => {
    if (!entry.duration) return 0;

    // Try to get task by ID first, then by name
    let task = getTaskById(entry.taskId);
    if (!task) {
      task = getTaskByName(entry.taskName);
    }

    if (!task?.hourlyRate || task.hourlyRate <= 0) return 0;

    const hours = entry.duration / (1000 * 60 * 60);
    return hours * task.hourlyRate;
  };

  const earnings = calculateEarnings();

  return (
    <TableRow hover sx={sx}>
      <TableCell>
        <Typography variant="body1">
          {entry.taskName}
        </Typography>
      </TableCell>
      
      <TableCell>
        {formatLocalTime(entry.startTime)}
      </TableCell>
      
      <TableCell>
        {entry.endTime ? formatLocalTime(entry.endTime) : 'Running'}
      </TableCell>
      
      <TableCell>
        {entry.duration && formatDuration(entry.duration)}
      </TableCell>
      
      {showEarnings && (
        <TableCell>
          <EarningsDisplay amount={earnings} />
        </TableCell>
      )}
      
      <TableCell align="right">
        <ActionButton
          onClick={() => onEdit(entry)}
          icon={<EditIcon fontSize="small" />}
          variant="text"
          size="small"
          color="primary"
          tooltip="Edit"
          sx={{ mr: 1 }}
        />
        
        <ActionButton
          onClick={() => onDelete(entry.id)}
          icon={<DeleteIcon fontSize="small" />}
          variant="text"
          size="small"
          color="error"
          tooltip="Delete"
        />
      </TableCell>
    </TableRow>
  );
}
