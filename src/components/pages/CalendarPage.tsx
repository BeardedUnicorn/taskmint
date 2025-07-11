import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography, Paper, CircularProgress, IconButton, useTheme, Button } from '@mui/material';
import { format, addMonths, subMonths, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useFundsReleaseSettings } from '../../hooks/useFundsReleaseSettings';
import { TimerService } from '../../services/TimerService';
import { TaskService } from '../../services/TaskService';
import { StorageService } from '../../services/StorageService';
import { TimeEntry, Task } from '../../types';
import { calculateEntryEarnings } from '../../utils/earningsCalculator';

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    earned: number;
    transferable: number;
  };
}

const CalendarControls: React.FC<{
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}> = ({ currentDate, onPrev, onNext, onToday }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 2,
        px: 1,
      }}
    >
      <Box>
        <IconButton onClick={onPrev} aria-label="previous month">
          <ChevronLeft />
        </IconButton>
        <IconButton onClick={onNext} aria-label="next month">
          <ChevronRight />
        </IconButton>
        <Button onClick={onToday} variant="outlined" sx={{ ml: 2 }}>
          Today
        </Button>
      </Box>
      <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
        {format(currentDate, 'MMMM yyyy')}
      </Typography>
    </Box>
  );
};

const CalendarPage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(Views.MONTH);
  const { days: fundsReleaseDays } = useFundsReleaseSettings();
  const theme = useTheme();

  const storageService = useMemo(() => StorageService.getInstance(), []);
  const timerService = useMemo(() => new TimerService(storageService), [storageService]);
  const taskService = useMemo(() => new TaskService(storageService), [storageService]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [entries, allTasks] = await Promise.all([
          timerService.getTimeEntries(),
          taskService.getAllTasks(),
        ]);
        setTimeEntries(entries);
        setTasks(allTasks);
      } catch (error) {
        console.error('Error fetching calendar data:', error);
        // Set empty arrays as fallback
        setTimeEntries([]);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timerService, taskService]);

  const dailyData = useMemo(() => {
    // Calculate earnings for all days that have time entries
    const dailyEarned: Record<string, number> = {};
    timeEntries.forEach(entry => {
      const dateKey = format(new Date(entry.date), 'yyyy-MM-dd');
      dailyEarned[dateKey] = (dailyEarned[dateKey] || 0) + calculateEntryEarnings(entry, tasks);
    });

    // Generate all days in the current month view
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    // Get the start of the calendar view (may include days from previous month)
    const startOfCalendar = new Date(startOfMonth);
    startOfCalendar.setDate(startOfCalendar.getDate() - startOfMonth.getDay());
    
    // Get the end of the calendar view (may include days from next month)
    const endOfCalendar = new Date(endOfMonth);
    endOfCalendar.setDate(endOfCalendar.getDate() + (6 - endOfMonth.getDay()));
    
    const allDates: string[] = [];
    const current = new Date(startOfCalendar);
    
    while (current <= endOfCalendar) {
      allDates.push(format(current, 'yyyy-MM-dd'));
      current.setDate(current.getDate() + 1);
    }

    // Create data for all dates in the calendar view
    return allDates.map(dateStr => {
      const earned = dailyEarned[dateStr] || 0;
      const transferableDate = subDays(new Date(dateStr), fundsReleaseDays);
      const transferableKey = format(transferableDate, 'yyyy-MM-dd');
      const transferable = dailyEarned[transferableKey] || 0;

      return {
        date: dateStr,
        earned,
        transferable,
      };
    });
  }, [timeEntries, tasks, fundsReleaseDays, currentDate]);

  const events = useMemo((): CalendarEvent[] => {
    return dailyData.map(dayData => {
      const date = new Date(dayData.date);
      return {
        id: dayData.date,
        title: `Earned: $${dayData.earned.toFixed(2)}`,
        start: date,
        end: date,
        resource: {
          earned: dayData.earned,
          transferable: dayData.transferable,
        },
      };
    });
  }, [dailyData]);

  const handlePrevMonth = useCallback(() => {
    setCurrentDate(prev => subMonths(prev, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentDate(prev => addMonths(prev, 1));
  }, []);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleNavigate = useCallback((newDate: Date) => {
    setCurrentDate(newDate);
  }, []);

  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  const EventComponent = useCallback(({ event }: { event: CalendarEvent }) => {
    return (
      <Box
        sx={{
          fontSize: '11px',
          lineHeight: 1.2,
          padding: '2px',
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ fontWeight: 'bold', mb: 0.5 }}>
          ${event.resource.earned.toFixed(2)}
        </Box>
        <Box sx={{ fontSize: '9px', opacity: 0.9 }}>
          Transferable: ${event.resource.transferable.toFixed(2)}
        </Box>
      </Box>
    );
  }, [theme]);

  const DayPropGetter = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const hasData = dailyData.some(d => d.date === dateStr);
    
    return {
      style: {
        backgroundColor: hasData ? theme.palette.action.hover : 'transparent',
      },
    };
  }, [dailyData, theme]);

  const calendarStyle = useMemo(() => ({
    height: 600,
    // All styling is now handled by CSS to prevent theme conflicts
  }), []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Paper elevation={3} sx={{ p: { xs: 1, sm: 2 }, borderRadius: 2 }}>
        <CalendarControls
          currentDate={currentDate}
          onPrev={handlePrevMonth}
          onNext={handleNextMonth}
          onToday={handleToday}
        />
        <Box 
          sx={{
            ...calendarStyle,
            // Set CSS custom properties for theme integration
            '--mui-palette-background-default': theme.palette.background.default,
            '--mui-palette-background-paper': theme.palette.background.paper,
            '--mui-palette-text-primary': theme.palette.text.primary,
            '--mui-palette-text-secondary': theme.palette.text.secondary,
            '--mui-palette-text-disabled': theme.palette.text.disabled,
            '--mui-palette-divider': theme.palette.divider,
            '--mui-palette-action-disabled': theme.palette.action.disabled,
            '--mui-palette-primary-main': theme.palette.primary.main,
          }}
        >
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={view}
            onView={handleViewChange}
            date={currentDate}
            onNavigate={handleNavigate}
            views={[Views.MONTH]}
            toolbar={false}
            popup={false}
            components={{
              event: EventComponent,
            }}
            dayPropGetter={DayPropGetter}
            formats={{
              dateFormat: 'D',
              dayFormat: (date: Date, culture?: string, localizer?: any) =>
                localizer.format(date, 'ddd', culture),
            }}
            eventPropGetter={() => ({
              style: {
                backgroundColor: 'transparent',
                border: 'none',
              },
            })}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default CalendarPage;
