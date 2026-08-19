import { useState, useMemo, useEffect, Suspense, lazy } from 'react';
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
import { DailyGoalAchievement } from '../../types/goal';
import { formatLocalTime } from '../../utils/dateHelpers';
import { getEntryElapsedMs } from '../../utils/timerHelpers';
import { formatDuration } from '../../utils/formatters';
import { EarningsDisplay } from '../ui/display/EarningsDisplay';
import { GoalAchievementsTable } from '../ui/tables/GoalAchievementsTable';
import { useDailyGoals } from '../../hooks/useDailyGoals';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { EditTimeEntryData } from '../../types/form';
import { useSubscription, useFeatureAccess } from '../../contexts/SubscriptionContext';
import { FEATURES } from '../../types/subscription';
import { UpgradeDialog } from '../ui/UpgradeDialog';

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
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

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
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs().subtract(7, 'days'));
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs());
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [timelineView, setTimelineView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Subscription access control
  const { subscription, upgradeSubscription } = useSubscription();
  const { hasAccess: hasAdvancedReports } = useFeatureAccess(FEATURES.ADVANCED_REPORTS);

  // Daily goals hook and state
  const { getAchievementsForDateRange } = useDailyGoals();
  const [filteredAchievements, setFilteredAchievements] = useState<DailyGoalAchievement[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  // Filter entries based on date range and selected tasks
  const filteredEntries = useMemo(() => {
    return timeEntries.filter(entry => {
      // Filter by date range
      const entryDate = dayjs(entry.startTime);
      const isInDateRange = startDate && endDate ? entryDate.isBetween(startDate, endDate, 'day', '[]') : true;
      
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
    
    const totalEarnings = filteredEntries.reduce((total, entry) => {
      if (!entry.duration) return total;
      
      // Find task for earnings calculation
      let task = tasks.find(t => t.id === entry.taskId);
      if (!task) {
        task = tasks.find(t => t.name === entry.taskName);
      }
      
      if (!task?.hourlyRate) return total;
      
      const hours = entry.duration / (1000 * 60 * 60);
      return total + (hours * task.hourlyRate);
    }, 0);

    const uniqueTasks = new Set(filteredEntries.map(entry => entry.taskName));
    
    return {
      totalDuration,
      totalEarnings,
      entryCount: filteredEntries.length,
      taskCount: uniqueTasks.size,
    };
  }, [filteredEntries, tasks]);

  // Load goal achievements when date range changes
  useEffect(() => {
    const loadAchievements = async () => {
      setAchievementsLoading(true);
      try {
        const startDateStr = startDate ? startDate.format('YYYY-MM-DD') : '';
        const endDateStr = endDate ? endDate.format('YYYY-MM-DD') : '';
        const achievements = await getAchievementsForDateRange(startDateStr, endDateStr);
        setFilteredAchievements(achievements);
      } catch (error) {
        console.error('Failed to load achievements:', error);
        setFilteredAchievements([]);
      } finally {
        setAchievementsLoading(false);
      }
    };

    loadAchievements();
  }, [startDate, endDate, getAchievementsForDateRange]);

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

  const getTaskById = (taskId?: string) => {
    if (!taskId) return undefined;
    return tasks.find(task => task.id === taskId);
  };

  const getTaskByName = (taskName: string) => {
    return tasks.find(task => task.name === taskName);
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEdit = (data: EditTimeEntryData) => {
    if (!editingEntry) return;

    onUpdateEntry(data);
    setEditingEntry(null);
  };

  const handleUpgrade = async (sku: any) => {
    try {
      await upgradeSubscription(sku);
      setShowUpgradeDialog(false);
    } catch (error) {
      console.error('Failed to upgrade subscription:', error);
    }
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
          
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
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
          <>
            {hasAdvancedReports ? (
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
            ) : (
              /* Upgrade Required for Advanced Reports */
              <Paper sx={{ p: 3, mb: 3 }}>
                <Alert 
                  severity="warning" 
                  action={
                    <Button 
                      color="inherit" 
                      size="small" 
                      onClick={() => setShowUpgradeDialog(true)}
                    >
                      Upgrade
                    </Button>
                  }
                >
                  <Typography variant="h6" gutterBottom>
                    Advanced Reports & Analytics
                  </Typography>
                  <Typography variant="body2">
                    Unlock visual analytics including charts, graphs, and advanced reporting features with Pro or Power subscription.
                  </Typography>
                </Alert>
              </Paper>
            )}
          </>
        )}

        {/* Time Entries Table */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Time Entries
          </Typography>
          
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
                    // Find task for earnings calculation
                    let task = getTaskById(entry.taskId);
                    if (!task) {
                      task = getTaskByName(entry.taskName);
                    }

                    const earnings = task?.hourlyRate && entry.duration
                      ? (entry.duration / (1000 * 60 * 60)) * task.hourlyRate
                      : 0;

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
                              onClick={() => onDeleteEntry(entry.id)}
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
            achievements={filteredAchievements}
            loading={achievementsLoading}
          />
        </Paper>

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

        {/* Upgrade Dialog */}
        <UpgradeDialog
          open={showUpgradeDialog}
          onClose={() => setShowUpgradeDialog(false)}
          onUpgrade={handleUpgrade}
          currentSku={subscription?.sku}
          featureName="Advanced Reports & Analytics"
          requiredSku="pro-lifetime"
        />
      </Box>
    </LocalizationProvider>
  );
}
