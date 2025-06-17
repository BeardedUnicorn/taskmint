import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  TextField,
  Box,
  Typography,
  Stack,
} from '@mui/material';
import { Edit } from '@mui/icons-material';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { useTimer } from '../../hooks/useTimer';
import { formatTime, parseTimeInput } from '../../utils/formatters';
import { formatDateTimeLocal, formatDateString } from '../../utils/dateHelpers';
import { TaskSelector, TimerButton, TimerDisplay, TimeInput, ActionButton } from '../ui';
import dayjs from 'dayjs';

interface TimeEntryFormProps {
  onSave: (entry: TimeEntry) => void;
  predefinedTasks: Task[];
  activeEntry?: TimeEntry | null;
  onUpdateActiveEntry: (entry: TimeEntry | null) => void;
  onCreateNewTask: (taskName: string) => Promise<Task>;
}

export function TimeEntryForm({
                                onSave,
                                predefinedTasks,
                                activeEntry,
                                onUpdateActiveEntry,
                                onCreateNewTask
                              }: TimeEntryFormProps) {
  const [taskName, setTaskName] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [customStartTime, setCustomStartTime] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const elapsed = useTimer(isRunning, startTime || undefined);

  const handleTaskChange = (value: string, task?: Task | null) => {
    setTaskName(value);
    setSelectedTask(task || null);
  };

  useEffect(() => {
    if (activeEntry) {
      setTaskName(activeEntry.taskName);
      setStartTime(activeEntry.startTime);
      setIsRunning(activeEntry.isRunning);
      setCustomStartTime(formatDateTimeLocal(activeEntry.startTime));
    } else {
      // Reset form when no active entry
      setTaskName('');
      setStartTime(null);
      setIsRunning(false);
      setCustomStartTime('');
      setIsEditing(false);
    }
  }, [activeEntry]);

  // formatTime and parseTimeInput functions are now imported from utils/formatters

  const handleStart = () => {
    let actualStartTime: Date;

    if (customStartTime) {
      actualStartTime = new Date(customStartTime);
    } else {
      actualStartTime = new Date();
    }

    const entry: TimeEntry = {
      id: Date.now().toString(),
      taskName,
      taskId: selectedTask?.id,
      startTime: actualStartTime,
      isRunning: true,
      date: formatDateString(actualStartTime),
    };

    setStartTime(actualStartTime);
    setIsRunning(true);
    onUpdateActiveEntry(entry);
  };

  const handleStop = () => {
    if (startTime && activeEntry) {
      const now = new Date();
      const duration = now.getTime() - startTime.getTime();

      const finalEntry: TimeEntry = {
        ...activeEntry,
        endTime: now,
        duration: duration,
        isRunning: false,
        date: formatDateString(startTime),
      };

      console.log('Saving entry:', finalEntry);

      setIsRunning(false);
      onSave(finalEntry);
      onUpdateActiveEntry(null);

      // Reset form
      setTaskName('');
      setStartTime(null);
      setCustomStartTime('');
      setIsEditing(false);
    }
  };

  const handleTimeEdit = (newTime: string) => {
    if (startTime) {
      try {
        const newElapsed = parseTimeInput(newTime);
        const newStartTime = new Date(Date.now() - newElapsed);
        setStartTime(newStartTime);

        if (activeEntry) {
          const updatedEntry: TimeEntry = {
            ...activeEntry,
            startTime: newStartTime,
            date: formatDateString(newStartTime),
          };
          onUpdateActiveEntry(updatedEntry);
        }
      } catch (error) {
        console.error('Invalid time format:', error);
      }
    }
  };

  return (
    <Card sx={{ height: 'fit-content' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Time Entry
        </Typography>

        <Stack spacing={3}>
          <TaskSelector
            value={taskName}
            onChange={handleTaskChange}
            predefinedTasks={predefinedTasks}
            onCreateNewTask={onCreateNewTask}
            disabled={isRunning}
            placeholder="Select or enter task name..."
          />

          {!isRunning && (
            <TextField
              label="Start Time (Optional)"
              type="datetime-local"
              value={customStartTime}
              onChange={(e) => setCustomStartTime(e.target.value)}
              InputLabelProps={{
                shrink: true,
              }}
              helperText="Leave empty to start immediately"
              size="small"
            />
          )}

          {isRunning && (
            <Box>
              <TimerDisplay
                elapsed={elapsed}
                isRunning={isRunning}
                taskName={taskName}
                showTaskName={false}
                size="large"
                sx={{ mb: 2 }}
              />

              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Started: {dayjs(startTime).format('HH:mm:ss')}
                </Typography>
              </Box>

              <ActionButton
                onClick={() => setIsEditing(!isEditing)}
                icon={<Edit />}
                variant="outlined"
                size="small"
                sx={{ mb: 2 }}
              >
                Edit Time
              </ActionButton>

              {isEditing && (
                <TimeInput
                  value={formatTime(elapsed)}
                  onChange={handleTimeEdit}
                  label="Edit Time"
                  placeholder="00:00:00"
                  helperText="Enter time in HH:MM:SS format"
                  sx={{ mt: 2 }}
                />
              )}
            </Box>
          )}

          <TimerButton
            isRunning={isRunning}
            onStart={handleStart}
            onStop={handleStop}
            disabled={!taskName.trim()}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
