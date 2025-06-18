import { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  Schedule as TimeIcon,
  CalendarToday as DateIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { TimeEntry } from '../../../types/timer';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { formatLocalTime } from '../../../utils/dateHelpers';
import { EarningsDisplay } from '../../ui/display/EarningsDisplay';
import dayjs from 'dayjs';

interface TaskDetailPaneProps {
  task: Task;
  timeEntries: TimeEntry[];
}

export function TaskDetailPane({
  task,
  timeEntries,
}: TaskDetailPaneProps) {
  // Filter time entries for this task
  const taskEntries = useMemo(() => {
    return timeEntries.filter(entry => 
      (entry.taskId === task.id || entry.taskName === task.name) &&
      entry.duration && entry.duration > 0
    ).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [timeEntries, task.id, task.name]);

  // Calculate task statistics
  const taskStats = useMemo(() => {
    const totalDuration = taskEntries.reduce((total, entry) => total + (entry.duration || 0), 0);
    const totalEarnings = taskEntries.reduce((total, entry) => {
      if (!entry.duration || !task.hourlyRate) return total;
      const hours = entry.duration / (1000 * 60 * 60);
      return total + (hours * task.hourlyRate);
    }, 0);

    return {
      totalDuration,
      totalEarnings,
      entryCount: taskEntries.length,
    };
  }, [taskEntries, task.hourlyRate]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
          {task.name}
        </Typography>

        {/* Task Info */}
        <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MoneyIcon color="action" fontSize="small" />
            <Typography variant="body2">
              <strong>Hourly Rate:</strong> {
                task.hourlyRate ? formatCurrency(task.hourlyRate) : 'Not set'
              }
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DateIcon color="action" fontSize="small" />
            <Typography variant="body2">
              <strong>Created:</strong> {formatDate(task.createdAt)}
            </Typography>
          </Box>
        </Stack>

        {/* Task Statistics */}
        <Stack direction="row" spacing={2}>
          <Chip
            icon={<TimeIcon />}
            label={`Total Time: ${formatDuration(taskStats.totalDuration)}`}
            color="primary"
            variant="outlined"
          />
          {task.hourlyRate && taskStats.totalEarnings > 0 && (
            <Chip
              icon={<MoneyIcon />}
              label={`Total Earnings: ${formatCurrency(taskStats.totalEarnings)}`}
              color="success"
              variant="outlined"
            />
          )}
          <Chip
            label={`${taskStats.entryCount} entries`}
            color="info"
            variant="outlined"
          />
        </Stack>
      </Box>

      {/* Time Entries Section */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Time Entries
        </Typography>

        {taskEntries.length === 0 ? (
          <Alert severity="info">
            <Typography variant="body2">
              No time entries recorded for this task yet. Start a timer to begin tracking time!
            </Typography>
          </Alert>
        ) : (
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Date
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Start Time
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight={600}>
                      End Time
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Duration
                    </Typography>
                  </TableCell>
                  {task.hourlyRate && (
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Earnings
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <Typography variant="subtitle2" fontWeight={600}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {taskEntries.map((entry) => {
                  const earnings = task.hourlyRate && entry.duration
                    ? (entry.duration / (1000 * 60 * 60)) * task.hourlyRate
                    : 0;

                  return (
                    <TableRow key={entry.id} hover>
                      <TableCell>
                        <Typography variant="body2">
                          {dayjs(entry.startTime).format('MMM DD, YYYY')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatLocalTime(entry.startTime)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {entry.endTime ? formatLocalTime(entry.endTime) : 'Running'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {entry.duration && formatDuration(entry.duration)}
                        </Typography>
                      </TableCell>
                      {task.hourlyRate && (
                        <TableCell>
                          <EarningsDisplay amount={earnings} />
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Tooltip title="Edit Entry">
                          <IconButton size="small">
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Entry">
                          <IconButton size="small" color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}
