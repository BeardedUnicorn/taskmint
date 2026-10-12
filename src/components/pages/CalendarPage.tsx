import React, { useState, useMemo, useCallback } from 'react';
import { Box, Typography, Paper, CircularProgress, IconButton, useTheme, Button } from '@mui/material';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { Calendar, View, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useFundsReleaseSettings } from '../../hooks/useFundsReleaseSettings';
import { useSessionManagementContext } from '../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { useWorkLogContext } from '../../contexts/WorkLogContext';
import { formatDateString, parseDateStringLocal } from '../../utils/dateHelpers';
import { calendarLocalizer } from '../../utils/calendarLocalizer';
import { buildPayoutCells, centsToDollars } from '../../utils/payoutCalculator';
import { TimerState } from '../../types/timer';
import { WorkLogEntry } from '../../types/workLog';

const localizer = calendarLocalizer;

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
        {dayjs(currentDate).format('MMMM YYYY')}
      </Typography>
    </Box>
  );
};

const CalendarPage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);
  const { days: fundsReleaseDays } = useFundsReleaseSettings();
  const theme = useTheme();

  const { sessions, isLoading: sessionsLoading } = useSessionManagementContext();
  const { tasks, isLoading: tasksLoading } = useTaskManagementContext();

  let workLogEntries: WorkLogEntry[] = [];
  try {
    const workLogs = useWorkLogContext();
    workLogEntries = workLogs?.entries ?? [];
  } catch {
    // Graceful fallback if rendered without WorkLogProvider in isolated tests
  }

  const loading = (sessionsLoading && sessions.length === 0) || tasksLoading;

  // Running instances in progress do not contribute to finalized daily earnings
  const completedSessions = useMemo(() => {
    return sessions.map(s => ({
      ...s,
      timerInstances: s.timerInstances.filter(
        i => i.state !== TimerState.running && !i.isRunning
      ),
    }));
  }, [sessions]);

  const cells = useMemo(() => {
    return buildPayoutCells(workLogEntries, completedSessions, tasks, fundsReleaseDays, Date.now());
  }, [workLogEntries, completedSessions, tasks, fundsReleaseDays]);

  const dailyData = useMemo(() => {
    const dailyEarned: Record<string, number> = {};
    const dailyTransferable: Record<string, number> = {};

    for (const cell of cells) {
      const amount = centsToDollars(cell.actualCents + cell.estimatedCents);
      dailyEarned[cell.workDay] = (dailyEarned[cell.workDay] || 0) + amount;
      if (cell.releaseDay) {
        dailyTransferable[cell.releaseDay] = (dailyTransferable[cell.releaseDay] || 0) + amount;
      }
    }

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
      allDates.push(formatDateString(current));
      current.setDate(current.getDate() + 1);
    }

    // Create data for all dates in the calendar view
    return allDates.map(dateStr => {
      const earned = dailyEarned[dateStr] || 0;
      const transferable = dailyTransferable[dateStr] || 0;

      return {
        date: dateStr,
        earned,
        transferable,
      };
    });
  }, [cells, currentDate]);

  const events = useMemo((): CalendarEvent[] => {
    return dailyData.map(dayData => {
      const date = parseDateStringLocal(dayData.date);
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
    setCurrentDate(prev => dayjs(prev).subtract(1, 'month').toDate());
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentDate(prev => dayjs(prev).add(1, 'month').toDate());
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
    const dateStr = formatDateString(date);
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
