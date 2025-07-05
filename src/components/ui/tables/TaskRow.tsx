import { TableRow, TableCell, Typography } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { TaskRowProps } from '../../../types/table';
import { ActionButton } from '../buttons/ActionButton';
import { formatCurrency } from '../../../utils/formatters';
import { formatLocalDateForTable } from '../../../utils/dateHelpers';

/**
 * Table row component for displaying task data
 * Includes edit and delete actions with hourly rate formatting
 */
export function TaskRow({
  task,
  onEdit,
  onDelete,
  onView,
  showUsageStats = false,
  sx,
}: TaskRowProps) {
  const formatHourlyRate = (amount?: number): string => {
    if (amount === undefined || amount === null) return 'N/A';
    return `${formatCurrency(amount)}/hr`;
  };

  return (
    <TableRow hover sx={sx}>
      <TableCell>
        <Typography variant="body1" fontWeight="medium">
          {task.name}
        </Typography>
      </TableCell>
      
      <TableCell>
        <Typography variant="body2">
          {formatHourlyRate(task.hourlyRate)}
        </Typography>
      </TableCell>
      
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {formatLocalDateForTable(task.createdAt)}
        </Typography>
      </TableCell>
      
      {showUsageStats && (
        <TableCell>
          <Typography variant="body2" color="text.secondary">
            {/* Usage stats could be added here in the future */}
            -
          </Typography>
        </TableCell>
      )}
      
      <TableCell align="right">
        {onView && (
          <ActionButton
            onClick={() => onView(task)}
            icon={<ViewIcon fontSize="small" />}
            variant="text"
            size="small"
            color="primary"
            tooltip="View Task Details"
            sx={{ mr: 1 }}
          />
        )}

        <ActionButton
          onClick={() => onEdit(task)}
          icon={<EditIcon fontSize="small" />}
          variant="text"
          size="small"
          color="primary"
          tooltip="Edit Task"
          sx={{ mr: 1 }}
        />

        <ActionButton
          onClick={() => onDelete(task.id)}
          icon={<DeleteIcon fontSize="small" />}
          variant="text"
          size="small"
          color="error"
          tooltip="Delete Task"
        />
      </TableCell>
    </TableRow>
  );
}
