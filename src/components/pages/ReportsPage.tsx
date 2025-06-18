import { useState, useMemo } from 'react';
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
} from '@mui/material';
import {
  DatePicker,
} from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { formatLocalTime } from '../../utils/dateHelpers';
import { formatDuration } from '../../utils/formatters';
import { EarningsDisplay } from '../ui/display/EarningsDisplay';
import dayjs, { Dayjs } from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

interface ReportsPageProps {
  timeEntries: TimeEntry[];
  tasks: Task[];
  onDeleteEntry: (entryId: string) => void;
}

export function ReportsPage({
  timeEntries,
  tasks,
  onDeleteEntry,
}: ReportsPageProps) {
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().subtract(7, 'days'));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);

  // Filter entries based on date range and selected tasks
  const filteredEntries = useMemo(() => {
    return timeEntries.filter(entry => {
      // Filter by date range
      const entryDate = dayjs(entry.startTime);
      const isInDateRange = entryDate.isBetween(startDate, endDate, 'day', '[]');
      
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

  const getTaskById = (taskId?: string) => {
    if (!taskId) return undefined;
    return tasks.find(task => task.id === taskId);
  };

  const getTaskByName = (taskName: string) => {
    return tasks.find(task => task.name === taskName);
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
                onChange={(newValue) => newValue && setStartDate(newValue)}
                slotProps={{ textField: { size: 'small' } }}
              />
              <Typography variant="body2" color="text.secondary">
                to
              </Typography>
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={(newValue) => newValue && setEndDate(newValue)}
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
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option.name}
                    size="small"
                    {...getTagProps({ index })}
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
                      <Typography variant="subtitle2" fontWeight={600}>
                        Task
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
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Earnings
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="subtitle2" fontWeight={600}>
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
                              onClick={() => {/* TODO: Implement edit */}}
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
      </Box>
    </LocalizationProvider>
  );
}
