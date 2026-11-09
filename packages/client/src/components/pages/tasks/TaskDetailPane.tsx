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
  Stack,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  Schedule as TimeIcon,
  CalendarToday as DateIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Lock as LockIcon,
  PlayArrow as PlayIcon,
  History as HistoryIcon,
  Timer as TimerIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { EmptyState } from '../../ui/display/EmptyState';
import { TimeEntry } from '../../../types/timer';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { formatLocalTime, formatLocalDate, formatLocalDateTimeForDisplay } from '../../../utils/dateHelpers';
import { EarningsDisplay } from '../../ui/display/EarningsDisplay';
import { entryEarnings, entryRate } from '../../../utils/earnings';
import { WORKLOG_IMPORT_SOURCE } from '../../../types/workLog';
import { entryEnd, exportableEntries } from '../../../utils/csvExport';
import { PHONE } from '../../../theme/media';
import { STACK_WRAP } from '../../ui/phoneLayout';
import { PHONE_TABLE } from '../../ui/tables/tableStyles';

/** The pane lists this many of the newest entries; History has them all. */
export const RECENT_ENTRY_COUNT = 10;

interface TaskDetailPaneProps {
  task: Task;
  timeEntries: TimeEntry[];
  onEditEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  /** Stars or unstars the task; favorites lead the tray and start pickers. */
  onToggleFavorite: (taskId: string) => void;
  /** Starts (or continues) work on the task, like the tray and Sessions do. */
  onStart: (task: Task) => void;
  /** This task's timer is running right now. */
  isRunning: boolean;
  /** Opens History filtered to this task. */
  onViewHistory: (task: Task) => void;
  /** On a phone, where the pane replaces the list: back to the list. */
  onBack?: () => void;
}

export function TaskDetailPane({
  task,
  timeEntries,
  onEditEntry,
  onDeleteEntry,
  onToggleFavorite,
  onStart,
  isRunning,
  onViewHistory,
  onBack,
}: TaskDetailPaneProps) {
  // This task's finished entries (by id, or by name for older ones), newest first
  const taskEntries = useMemo(
    () =>
      exportableEntries(timeEntries)
        .filter(entry => entry.taskId === task.id || entry.taskName === task.name)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime()),
    [timeEntries, task.id, task.name]
  );

  // Calculate task statistics. Each entry earns at its session's rate, so a
  // later change to the task's rate doesn't rewrite these.
  const allTasks = useMemo(() => [task], [task]);
  const taskStats = useMemo(() => {
    const totalDuration = taskEntries.reduce((total, entry) => total + entry.duration, 0);
    const totalEarnings = taskEntries.reduce((total, entry) => total + entryEarnings(entry, allTasks), 0);

    return {
      totalDuration,
      totalEarnings,
      entryCount: taskEntries.length,
      hasRates: taskEntries.some(entry => entryRate(entry, allTasks) > 0),
    };
  }, [taskEntries, allTasks]);

  const formatDate = (dateString: string) => {
    return formatLocalDateTimeForDisplay(dateString);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider', [PHONE]: { p: 2 } }}>
        {onBack && (
          <Button startIcon={<BackIcon />} onClick={onBack} sx={{ mb: 1, ml: -1 }}>
            All tasks
          </Button>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, [PHONE]: { gap: 1 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flex: 1,
              minWidth: 0,
              [PHONE]: { flexWrap: 'wrap', gap: 1 },
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 600, [PHONE]: { overflowWrap: 'anywhere' } }}>
              {task.name}
            </Typography>
            {task.isArchived && <Chip label="Archived" size="small" color="warning" variant="outlined" />}
          </Box>
          {!task.isArchived && (
            <Button variant="contained" startIcon={<PlayIcon />} onClick={() => onStart(task)} disabled={isRunning}>
              {isRunning ? 'Running' : 'Start'}
            </Button>
          )}
          <Tooltip
            title={
              task.isFavorite
                ? 'Remove from favorites'
                : 'Add to favorites (listed first in the tray and when starting work)'
            }
          >
            <IconButton
              onClick={() => onToggleFavorite(task.id)}
              color={task.isFavorite ? 'warning' : 'default'}
              size="large"
              aria-label={task.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={!!task.isFavorite}
            >
              {task.isFavorite ? <StarIcon /> : <StarBorderIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Task Info */}
        <Stack
          direction="row"
          spacing={3}
          sx={{ mb: 2, [PHONE]: { flexDirection: 'column', gap: 0.5, '& > :not(style) ~ :not(style)': { ml: 0 } } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MoneyIcon color="action" fontSize="small" />
            <Typography variant="body2">
              <strong>Hourly Rate:</strong> {task.hourlyRate ? formatCurrency(task.hourlyRate) : 'Not set'}
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
        <Stack direction="row" spacing={2} sx={{ [PHONE]: STACK_WRAP }}>
          <Chip
            icon={<TimeIcon />}
            label={`Total Time: ${formatDuration(taskStats.totalDuration)}`}
            color="primary"
            variant="outlined"
          />
          {taskStats.totalEarnings > 0 && (
            <Chip
              icon={<MoneyIcon />}
              label={`Total Earnings: ${formatCurrency(taskStats.totalEarnings)}`}
              color="success"
              variant="outlined"
            />
          )}
          <Chip label={`${taskStats.entryCount} entries`} color="info" variant="outlined" />
        </Stack>
      </Box>

      {/* Time Entries Section */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, [PHONE]: { p: 2 } }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Time Entries
        </Typography>

        {taskEntries.length === 0 ? (
          <EmptyState
            plain
            icon={<TimerIcon />}
            title="No time entries recorded for this task yet"
            description="Start it to begin tracking time."
          />
        ) : (
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small" sx={PHONE_TABLE}>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Date
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Start Time
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      End Time
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Duration
                    </Typography>
                  </TableCell>
                  {taskStats.hasRates && (
                    <TableCell>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Earnings
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {taskEntries.slice(0, RECENT_ENTRY_COUNT).map(entry => {
                  const earnings = entryEarnings(entry, allTasks);

                  return (
                    <TableRow key={entry.id} hover>
                      <TableCell>
                        <Typography variant="body2">{formatLocalDate(entry.startTime)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatLocalTime(entry.startTime)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatLocalTime(entryEnd(entry))}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatDuration(entry.duration)}</Typography>
                      </TableCell>
                      {taskStats.hasRates && (
                        <TableCell>
                          <EarningsDisplay amount={earnings} />
                        </TableCell>
                      )}
                      <TableCell align="right">
                        {entry.source === WORKLOG_IMPORT_SOURCE ? (
                          // Imported days are rebuilt by every import
                          <Tooltip title="Set by the work-log import. Re-import to change it.">
                            <Box
                              component="span"
                              aria-label="Imported entries are read-only"
                              sx={{ display: 'inline-flex', p: 0.625, color: 'text.disabled' }}
                            >
                              <LockIcon fontSize="small" />
                            </Box>
                          </Tooltip>
                        ) : (
                          <>
                            <Tooltip title="Edit Entry">
                              <IconButton size="small" onClick={() => onEditEntry(entry)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Entry">
                              <IconButton size="small" color="error" onClick={() => onDeleteEntry(entry.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {taskEntries.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            {taskEntries.length > RECENT_ENTRY_COUNT && (
              <Typography variant="body2" color="text.secondary">
                The newest {RECENT_ENTRY_COUNT} of {taskEntries.length}
              </Typography>
            )}
            <Button size="small" startIcon={<HistoryIcon />} onClick={() => onViewHistory(task)}>
              View all in History ({taskEntries.length})
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
