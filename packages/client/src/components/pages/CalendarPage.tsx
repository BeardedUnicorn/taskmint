import React, { useState, useMemo, useCallback } from 'react';
import { Box, Typography, Paper, Skeleton, IconButton, useTheme, Button } from '@mui/material';
import { PageContainer, PageHeader } from '../layout/PageLayout';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { Calendar, View, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useFundsReleaseSettings } from '../../hooks/useFundsReleaseSettings';
import { useSessionManagementContext } from '../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { useOptionalWorkLogContext } from '../../contexts/WorkLogContext';
import { formatDateString, parseDateStringLocal } from '../../utils/dateHelpers';
import { calendarLocalizer } from '../../utils/calendarLocalizer';
import { buildPayoutCells, centsToDollars } from '../../utils/payoutCalculator';
import { formatCurrency, formatDuration } from '../../utils/formatters';
import { CalendarDayDialog } from '../ui/dialogs/CalendarDayDialog';
import { TimerState } from '../../types/timer';
import { WorkLogEntry } from '../../types/workLog';

const localizer = calendarLocalizer;
const EMPTY_ENTRIES: WorkLogEntry[] = [];

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    earned: number;
    /** Money from earlier work days that becomes available this day */
    released: number;
    trackedMs: number;
  };
}

const CalendarControls: React.FC<{
  currentDate: Date;
  /** The month's tracked time and earnings, e.g. "42h 10m · $1,234.00" */
  monthSummary: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}> = ({ currentDate, monthSummary, onPrev, onNext, onToday }) => {
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
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
          {dayjs(currentDate).format('MMMM YYYY')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {monthSummary}
        </Typography>
      </Box>
    </Box>
  );
};

const CalendarPage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);
  // The day whose breakdown is open (YYYY-MM-DD)
  const [openDay, setOpenDay] = useState<string | null>(null);
  const { days: fundsReleaseDays } = useFundsReleaseSettings();
  const theme = useTheme();

  const { sessions, isLoading: sessionsLoading } = useSessionManagementContext();
  const { tasks, isLoading: tasksLoading } = useTaskManagementContext();

  const workLogEntries: WorkLogEntry[] = useOptionalWorkLogContext()?.entries ?? EMPTY_ENTRIES;

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
    const dailyReleased: Record<string, number> = {};
    const dailyTrackedMs: Record<string, number> = {};

    for (const cell of cells) {
      const amount = centsToDollars(cell.actualCents + cell.estimatedCents);
      dailyEarned[cell.workDay] = (dailyEarned[cell.workDay] || 0) + amount;
      dailyTrackedMs[cell.workDay] = (dailyTrackedMs[cell.workDay] || 0) + cell.trackedMs;
      if (cell.releaseDay) {
        dailyReleased[cell.releaseDay] = (dailyReleased[cell.releaseDay] || 0) + amount;
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
    return allDates.map(dateStr => ({
      date: dateStr,
      earned: dailyEarned[dateStr] || 0,
      released: dailyReleased[dateStr] || 0,
      trackedMs: dailyTrackedMs[dateStr] || 0,
    }));
  }, [cells, currentDate]);

  // Only days with time or money get an event; a "$0.00" on every empty day
  // buries the days that matter.
  const activeDays = useMemo(
    () => dailyData.filter(day => day.earned > 0 || day.released > 0 || day.trackedMs > 0),
    [dailyData]
  );

  // The shown month's own work days (not the neighbours' days in its grid)
  const monthSummary = useMemo(() => {
    const month = dayjs(currentDate).format('YYYY-MM');
    let trackedMs = 0;
    let earnedCents = 0;
    for (const cell of cells) {
      if (!cell.workDay.startsWith(month)) continue;
      trackedMs += cell.trackedMs;
      earnedCents += cell.actualCents + cell.estimatedCents;
    }
    return `${formatDuration(trackedMs)} · ${formatCurrency(centsToDollars(earnedCents))}`;
  }, [cells, currentDate]);

  const events = useMemo((): CalendarEvent[] => {
    return activeDays.map(dayData => {
      const date = parseDateStringLocal(dayData.date);
      return {
        id: dayData.date,
        title: `Earned: ${formatCurrency(dayData.earned)}`,
        start: date,
        end: date,
        resource: {
          earned: dayData.earned,
          released: dayData.released,
          trackedMs: dayData.trackedMs,
        },
      };
    });
  }, [activeDays]);

  const openDayOf = useCallback((date: Date) => setOpenDay(formatDateString(date)), []);

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
        {event.resource.earned > 0 && (
          <Box sx={{ fontWeight: 'bold', mb: 0.25 }}>
            {formatCurrency(event.resource.earned)}
          </Box>
        )}
        {event.resource.trackedMs > 0 && (
          <Box sx={{ fontSize: '9px', opacity: 0.9 }}>
            {formatDuration(event.resource.trackedMs)}
          </Box>
        )}
        {event.resource.released > 0 && (
          <Box sx={{ fontSize: '9px', opacity: 0.9 }}>
            Released: {formatCurrency(event.resource.released)}
          </Box>
        )}
      </Box>
    );
  }, [theme]);

  const DayPropGetter = useCallback((date: Date) => {
    const dateStr = formatDateString(date);
    const isActive = activeDays.some(d => d.date === dateStr);

    return {
      style: {
        backgroundColor: isActive ? theme.palette.action.hover : 'transparent',
      },
    };
  }, [activeDays, theme]);

  const calendarStyle = useMemo(() => ({
    height: 600,
    // All styling is now handled by CSS to prevent theme conflicts
  }), []);

  const header = <PageHeader title="Calendar" subtitle="Tracked time and earnings, day by day" />;

  if (loading) {
    return (
      <PageContainer>
        {header}
        <Skeleton variant="rounded" height={680} aria-label="Loading calendar" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}
      <Paper elevation={3} sx={{ p: { xs: 1, sm: 2 }, borderRadius: 2 }}>
        <CalendarControls
          currentDate={currentDate}
          monthSummary={monthSummary}
          onPrev={handlePrevMonth}
          onNext={handleNextMonth}
          onToday={handleToday}
        />
        <Box 
          sx={{
            ...calendarStyle,
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
            // Clicking a day (or its event) opens that day's breakdown
            selectable
            onSelectSlot={slot => openDayOf(slot.start)}
            onSelectEvent={event => openDayOf(event.start)}
            drilldownView={null}
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
      <CalendarDayDialog date={openDay} cells={cells} onClose={() => setOpenDay(null)} />
    </PageContainer>
  );
};

export default CalendarPage;
