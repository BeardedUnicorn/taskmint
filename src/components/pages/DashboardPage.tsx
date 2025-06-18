import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
} from '@mui/material';
import {
  Timer as TimerIcon,
  AttachMoney as MoneyIcon,
  Assignment as TaskIcon,
} from '@mui/icons-material';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { StatsCard } from '../ui/display/StatsCard';
import { TodaysEntriesList } from './dashboard/TodaysEntriesList';
import { formatDuration } from '../../utils/formatters';
import dayjs from 'dayjs';

interface DashboardPageProps {
  timeEntries: TimeEntry[];
  tasks: Task[];
  onUpdateEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (entryId: string) => void;
}

interface DashboardStats {
  totalTimeToday: number;
  earningsToday: number;
  tasksWorkedOn: number;
}

export function DashboardPage({
  timeEntries,
  tasks,
  onUpdateEntry,
  onDeleteEntry,
}: DashboardPageProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalTimeToday: 0,
    earningsToday: 0,
    tasksWorkedOn: 0,
  });

  // Calculate today's statistics
  useEffect(() => {
    const today = dayjs().format('YYYY-MM-DD');
    
    // Filter entries for today
    const todaysEntries = timeEntries.filter(entry => {
      const entryDate = dayjs(entry.startTime).format('YYYY-MM-DD');
      return entryDate === today && entry.duration && entry.duration > 0;
    });

    // Calculate total time today
    const totalTimeToday = todaysEntries.reduce((total, entry) => {
      return total + (entry.duration || 0);
    }, 0);

    // Calculate earnings today
    const earningsToday = todaysEntries.reduce((total, entry) => {
      if (!entry.duration) return total;

      // Try to get task by ID first, then by name
      let task = tasks.find(t => t.id === entry.taskId);
      if (!task) {
        task = tasks.find(t => t.name === entry.taskName);
      }

      if (!task?.hourlyRate || task.hourlyRate <= 0) return total;

      const hours = entry.duration / (1000 * 60 * 60);
      return total + (hours * task.hourlyRate);
    }, 0);

    // Calculate unique tasks worked on today
    const uniqueTaskNames = new Set(todaysEntries.map(entry => entry.taskName));
    const tasksWorkedOn = uniqueTaskNames.size;

    setStats({
      totalTimeToday,
      earningsToday,
      tasksWorkedOn,
    });
  }, [timeEntries, tasks]);

  // Get today's entries for the list
  const today = dayjs().format('YYYY-MM-DD');
  const todaysEntries = timeEntries.filter(entry => {
    const entryDate = dayjs(entry.startTime).format('YYYY-MM-DD');
    return entryDate === today && entry.duration && entry.duration > 0;
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
        Dashboard
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {dayjs().format('dddd, MMMM DD, YYYY')}
      </Typography>

      {/* Stats Cards Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3, mb: 4 }}>
        <StatsCard
          title="Total Time Today"
          value={formatDuration(stats.totalTimeToday)}
          subtitle={stats.totalTimeToday > 0 ? 'Keep up the great work!' : 'Start tracking your time'}
          icon={<TimerIcon sx={{ fontSize: 40 }} />}
          color="primary"
        />

        <StatsCard
          title="Earnings Today"
          value={stats.earningsToday}
          subtitle={stats.earningsToday > 0 ? 'Based on hourly rates' : 'Set hourly rates to track earnings'}
          icon={<MoneyIcon sx={{ fontSize: 40 }} />}
          color="success"
        />

        <StatsCard
          title="Tasks Worked On"
          value={stats.tasksWorkedOn}
          subtitle={stats.tasksWorkedOn === 1 ? 'task today' : 'tasks today'}
          icon={<TaskIcon sx={{ fontSize: 40 }} />}
          color="info"
        />
      </Box>

      {/* Today's Entries Section */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Today's Time Entries
          </Typography>
          
          {todaysEntries.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              No time entries recorded for today. Start a timer to begin tracking your work!
            </Alert>
          ) : (
            <TodaysEntriesList
              entries={todaysEntries}
              tasks={tasks}
              onUpdateEntry={onUpdateEntry}
              onDeleteEntry={onDeleteEntry}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
