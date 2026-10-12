import { useState, useMemo, Suspense, lazy } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Autocomplete,
  TextField,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Button,
  // Grid, // Removed unused import
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import {
  DatePicker,
} from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { formatLocalTime } from '../../utils/dateHelpers';
import { getEntryElapsedMs } from '../../utils/timerHelpers';
import { formatDuration } from '../../utils/formatters';
import { EarningsDisplay } from '../ui/display/EarningsDisplay';
import { entryEarnings } from '../../utils/earnings';
import { GoalAchievementsTable } from '../ui/tables/GoalAchievementsTable';
import { useDailyGoals } from '../../hooks/useDailyGoals';
import { buildGoalHistory } from '../../utils/goalHistory';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { ConfirmDialog } from '../ui/dialogs/ConfirmDialog';
import { EditTimeEntryData } from '../../types/form';
import { DateRangePresetSelect } from '../ui/filters/DateRangePresetSelect';
import { DateRange, DateRangePreset, isDateRangePreset, presetRange } from '../../utils/dateRanges';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useCsvExport } from '../../hooks/useCsvExport';
import { csvFileName, timeEntriesToCsv } from '../../utils/csvExport';
import { Download as DownloadIcon } from '@mui/icons-material';

// Lazy load chart components for better performance
const TaskTimeBarChart = lazy(() => import('../ui/charts/TaskTimeBarChart').then(module => ({ default: module.TaskTimeBarChart })));
const TimelineChart = lazy(() => import('../ui/charts/TimelineChart').then(module => ({ default: module.TimelineChart })));
const TaskDistributionPieChart = lazy(() => import('../ui/charts/TaskDistributionPieChart').then(module => ({ default: module.TaskDistributionPieChart })));
import {
  aggregateByTask,
  aggregateByDay,
  aggregateByWeek,
  aggregateByMonth,
  prepareTaskDistributionData,
} from '../../utils/chartDataHelpers';
import dayjs, { Dayjs } from 'dayjs';

interface ReportsPageProps {
  timeEntries: TimeEntry[];
  tasks: Task[];
  onDeleteEntry: (entryId: string) => void;
  onUpdateEntry: (data: EditTimeEntryData) => void;
}

export function ReportsPage({
  timeEntries,
  tasks,
  onDeleteEntry,
  onUpdateEntry,
}: ReportsPageProps) {
  // The last quick range chosen (not its dates), so "This month" stays current
  const [savedPreset, setSavedPreset] = useLocalStorage<DateRangePreset>('reportsDatePreset', 'last7');
  const [initialRange] = useState(() =>
    presetRange(isDateRangePreset(savedPreset) ? savedPreset : 'last7')
  );
  const [startDate, setStartDate] = useState<Dayjs | null>(initialRange.start);
  const [endDate, setEndDate] = useState<Dayjs | null>(initialRange.end);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [timelineView, setTimelineView] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const { exportCsv, isExporting } = useCsvExport();

  // Daily goals hook and state
  const { achievements, currentGoal } = useDailyGoals();

  // Filter entries based on date range and selected tasks
  const filteredEntries = useMemo(() => {
    return timeEntries.filter(entry => {
      // Filter by date range (either end may be open)
      const entryDate = dayjs(entry.startTime);
      const isInDateRange =
        (!startDate || !entryDate.isBefore(startDate, 'day')) &&
        (!endDate || !entryDate.isAfter(endDate, 'day'));
      
      // Filter by selected tasks (if any)
      const isTaskSelected = selectedTasks.length === 0 || 
        selectedTasks.some(task => 
          task.id === entry.taskId || task.name === entry.taskName
        );
      
      // Only include completed entries with duration
      const isCompleted = entry.duration && entry.duration > 0;
      
      return isInDateRange && isTaskSelected && isCompleted;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [timeEntries, startDate, endDate, selectedTasks]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalDuration = filteredEntries.reduce((total, entry) => total + (entry.duration || 0), 0);
    
    // Each entry earns at its session's rate (shared with every other page)
    const totalEarnings = filteredEntries.reduce(
      (total, entry) => total + entryEarnings(entry, tasks),
      0
    );

    const uniqueTasks = new Set(filteredEntries.map(entry => entry.taskName));
    
    return {
      totalDuration,
      totalEarnings,
      entryCount: filteredEntries.length,
      taskCount: uniqueTasks.size,
    };
  }, [filteredEntries, tasks]);

  // Goal results per day over the range (all tasks): each day's saved
  // target, earnings recomputed from tracked time so edits and imports count.
  const goalHistory = useMemo(
    () =>
      buildGoalHistory({
        startDate: startDate ? startDate.format('YYYY-MM-DD') : '0000-01-01',
        endDate: endDate ? endDate.format('YYYY-MM-DD') : '9999-12-31',
        timeEntries,
        tasks,
        records: achievements,
        currentGoal,
      }),
    [startDate, endDate, timeEntries, tasks, achievements, currentGoal]
  );

  // Chart data
  const chartData = useMemo(() => {
    const taskTimeData = aggregateByTask(filteredEntries, tasks);
    const taskDistributionData = prepareTaskDistributionData(filteredEntries);

    let timelineData;
    switch (timelineView) {
      case 'weekly':
        timelineData = aggregateByWeek(filteredEntries, tasks);
        break;
      case 'monthly':
        timelineData = aggregateByMonth(filteredEntries, tasks);
        break;
      default:
        timelineData = aggregateByDay(filteredEntries, tasks);
    }

    return {
      taskTimeData,
      taskDistributionData,
      timelineData,
    };
  }, [filteredEntries, tasks, timelineView]);

  const handlePresetChange = (range: DateRange, preset: DateRangePreset) => {
    setStartDate(range.start);
    setEndDate(range.end);
    setSavedPreset(preset);
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEdit = (data: EditTimeEntryData) => {
    if (!editingEntry) return;

    onUpdateEntry(data);
    setEditingEntry(null);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 3 }}>
        {/* Page Header */}
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Reports
        </Typography>
        
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Analyze your time tracking data with advanced filtering and reporting
        </Typography>

        {/* Filters */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Filters
          </Typography>
          
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            useFlexGap
            sx={{ flexWrap: 'wrap', alignItems: { md: 'center' } }}
          >
            <DateRangePresetSelect start={startDate} end={endDate} onChange={handlePresetChange} />

            {/* Date Range */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <DatePicker
                label="Start Date"
                value={startDate}
                onChange={(newValue) => setStartDate(newValue as Dayjs | null)}
                slotProps={{ textField: { size: 'small' } }}
              />
              <Typography variant="body2" color="text.secondary">
                to
              </Typography>
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={(newValue) => setEndDate(newValue as Dayjs | null)}
                slotProps={{ textField: { size: 'small' } }}
              />
            </Box>

            {/* Task Filter */}
            <Autocomplete
              multiple
              options={tasks}
              getOptionLabel={(option) => option.name}
              value={selectedTasks}
              onChange={(_, newValue) => setSelectedTasks(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Filter by Tasks"
                  placeholder="Select tasks..."
                  size="small"
                />
              )}
              renderValue={(value, getItemProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option.name}
                    size="small"
                    {...getItemProps({ index })}
                    key={option.id}
                  />
                ))
              }
              sx={{ minWidth: 300 }}
            />
          </Stack>
        </Paper>

        {/* Summary Statistics */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Summary
          </Typography>
          
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Total Time
              </Typography>
              <Typography variant="h6" color="primary">
                {formatDuration(summaryStats.totalDuration)}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="text.secondary">
                Total Earnings
              </Typography>
              <Typography variant="h6">
                <EarningsDisplay amount={summaryStats.totalEarnings} variant="h6" />
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="text.secondary">
                Time Entries
              </Typography>
              <Typography variant="h6" color="info.main">
                {summaryStats.entryCount}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="text.secondary">
                Tasks Worked On
              </Typography>
              <Typography variant="h6" color="secondary.main">
                {summaryStats.taskCount}
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {/* Charts Section */}
        {filteredEntries.length > 0 && (
          /* Chart Controls */
          <Paper sx={{ p: 3, mb: 3 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Visual Analytics
              </Typography>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Timeline View</InputLabel>
                <Select
                  value={timelineView}
                  label="Timeline View"
                  onChange={(e) => setTimelineView(e.target.value as any)}
                >
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Suspense fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                <CircularProgress />
              </Box>
            }>
              <Stack spacing={3}>
                {/* Top Row - Task Time Bar Chart and Task Distribution Pie Chart */}
                <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', lg: 'row' } }}>
                  {/* Task Time Bar Chart */}
                  <Box sx={{ flex: { lg: 2 }, minWidth: 0 }}>
                    <Paper variant="outlined" sx={{ p: 2, height: 450 }}>
                      <TaskTimeBarChart
                        data={chartData.taskTimeData}
                        showEarnings={true}
                        height={400}
                      />
                    </Paper>
                  </Box>

                  {/* Task Distribution Pie Chart */}
                  <Box sx={{ flex: { lg: 1 }, minWidth: 0 }}>
                    <Paper variant="outlined" sx={{ p: 2, height: 450 }}>
                      <TaskDistributionPieChart
                        data={chartData.taskDistributionData}
                        height={400}
                      />
                    </Paper>
                  </Box>
                </Box>

                {/* Timeline Chart */}
                <Paper variant="outlined" sx={{ p: 2, height: 450 }}>
                  <TimelineChart
                    data={chartData.timelineData}
                    dataType={timelineView}
                    showEarnings={true}
                    height={400}
                  />
                </Paper>
              </Stack>
            </Suspense>
          </Paper>
        )}

        {/* Time Entries Table */}
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Time Entries
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              disabled={filteredEntries.length === 0 || isExporting}
              onClick={() =>
                exportCsv(
                  timeEntriesToCsv(filteredEntries, tasks),
                  csvFileName(filteredEntries, startDate, endDate)
                )
              }
            >
              Export CSV
            </Button>
          </Stack>
          
          {filteredEntries.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              No time entries found for the selected date range and filters.
            </Alert>
          ) : (
            <TableContainer sx={{ mt: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Task
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
                    <TableCell>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Earnings
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Actions
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEntries.map((entry) => {
                    const earnings = entryEarnings(entry, tasks);

                    return (
                      <TableRow key={entry.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {entry.taskName}
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
                            {entry.duration ? formatDuration(entry.duration) : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <EarningsDisplay amount={earnings} />
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleEditEntry(entry)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => setDeletingEntryId(entry.id)}
                            >
                              Delete
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>

        {/* Daily Goal Achievements Section */}
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Daily Goal Achievements
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Track your daily earnings goal performance over the selected date range
          </Typography>

          <GoalAchievementsTable
            achievements={goalHistory}
          />
        </Paper>

        {/* Same confirmation as the Time Entries page: deleting loses tracked time */}
        <ConfirmDialog
          open={deletingEntryId !== null}
          title="Delete Time Entry"
          message="Are you sure you want to delete this time entry? This action cannot be undone."
          confirmLabel="Delete"
          confirmColor="error"
          onConfirm={() => {
            if (deletingEntryId) onDeleteEntry(deletingEntryId);
          }}
          onClose={() => setDeletingEntryId(null)}
        />

        {/* Edit Time Entry Dialog */}
        {editingEntry && (
          <EditTimeEntryDialog
            open={true}
            entry={{
              id: editingEntry.id,
              taskName: editingEntry.taskName,
              durationMs: getEntryElapsedMs(editingEntry),
              startTime: editingEntry.startTime
                ? new Date(editingEntry.startTime).toISOString()
                : undefined,
            }}
            onSave={handleSaveEdit}
            onClose={() => setEditingEntry(null)}
          />
        )}
      </Box>
    </LocalizationProvider>
  );
}
