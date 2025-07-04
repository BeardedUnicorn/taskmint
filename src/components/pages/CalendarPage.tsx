import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, Paper, CircularProgress, IconButton, useTheme, Button } from '@mui/material';
import { format, addMonths, subMonths, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import Calendar from '@toast-ui/react-calendar';
import '@toast-ui/calendar/dist/toastui-calendar.min.css';

import { useFundsReleaseSettings } from '../../hooks/useFundsReleaseSettings';
import { TimerService } from '../../services/TimerService';
import { TaskService } from '../../services/TaskService';
import { StorageService } from '../../services/StorageService';
import { TimeEntry, Task } from '../../types';
import { calculateEntryEarnings } from '../../utils/earningsCalculator';

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

const CalendarSchedule: React.FC<{
  calendarRef: React.RefObject<any>;
  calendarSchedules: any[];
  theme: any;
}> = ({ calendarRef, calendarSchedules, theme }) => (
  <Box
    sx={{
      // Override detail popup to match site theme
      '.tui-full-calendar-popup-container, .tui-full-calendar-popup': {
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        border: `1px solid ${theme.palette.divider}`,
      },
      '.tui-full-calendar-popup-close-btn, .tui-full-calendar-popup-title': {
        color: theme.palette.text.primary,
      },
    }}
  >
    <Calendar
      ref={calendarRef}
      height="800px"
      view="month"
      month={{
        daynames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        startDayOfWeek: 0,
        narrowWeekend: false,
        isAlways6Weeks: true,
      }}
      events={calendarSchedules}
      isReadOnly
      useDetailPopup
      template={{
        month: {
          schedule(event: any) {
            return (
              <div style={{ fontSize: '12px', lineHeight: 1.2 }}>
                <div>Earned: {event.earned.toFixed(2)}</div>
                <div>Transferable: {event.transferable.toFixed(2)}</div>
              </div>
            );
          },
        },
      }}
      theme={{
        common: {
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          dayname: { color: theme.palette.text.secondary },
          holiday: { color: theme.palette.error.main },
          saturday: { color: theme.palette.text.secondary },
          today: { color: theme.palette.primary.main },
        },
        month: {
          dayExceptThisMonth: { color: theme.palette.text.disabled },
          holidayExceptThisMonth: { color: 'rgba(255, 64, 64, 0.4)' },
          weekend: { backgroundColor: 'inherit' },
        },
      }}
    />
  </Box>
);

const CalendarPage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { days: fundsReleaseDays } = useFundsReleaseSettings();
  const theme = useTheme();
  const calendarRef = useRef<any>(null);

  const storageService = useMemo(() => StorageService.getInstance(), []);
  const timerService = useMemo(() => new TimerService(storageService), [storageService]);
  const taskService = useMemo(() => new TaskService(storageService), [storageService]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [entries, allTasks] = await Promise.all([
        timerService.getTimeEntries(),
        taskService.getAllTasks(),
      ]);
      setTimeEntries(entries);
      setTasks(allTasks);
      setLoading(false);
    };
    fetchData();
  }, [timerService, taskService]);

  const calendarSchedules = useMemo(() => {
    const dailyEarned: Record<string, number> = {};
    timeEntries.forEach(entry => {
      const dateKey = format(new Date(entry.date), 'yyyy-MM-dd');
      dailyEarned[dateKey] = (dailyEarned[dateKey] || 0) + calculateEntryEarnings(entry, tasks);
    });

    return Object.keys(dailyEarned).map(dateStr => {
      const earned = dailyEarned[dateStr];
      const transferableDate = subDays(new Date(dateStr), fundsReleaseDays);
      const transferableKey = format(transferableDate, 'yyyy-MM-dd');
      const transferable = dailyEarned[transferableKey] || 0;

      return {
        id: dateStr,
        calendarId: '1',
        title: `Earned: ${earned.toFixed(2)}`,
        category: 'time',
        start: dateStr,
        end: dateStr,
        isAllday: true,
        backgroundColor: theme.palette.primary.main,
        borderColor: theme.palette.primary.dark,
        earned,
        transferable,
      };
    });
  }, [timeEntries, tasks, fundsReleaseDays, theme.palette.primary.main, theme.palette.primary.dark]);

  useEffect(() => {
    const cal = calendarRef.current?.getInstance();
    if (cal) {
      cal.clear();
      cal.createEvents(calendarSchedules);
    }
  }, [calendarSchedules]);

  const handlePrevMonth = () => {
    calendarRef.current?.getInstance().prev();
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    calendarRef.current?.getInstance().next();
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handleToday = () => {
    calendarRef.current?.getInstance().today();
    setCurrentDate(new Date());
  };

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
        <CalendarSchedule
          calendarRef={calendarRef}
          calendarSchedules={calendarSchedules}
          theme={theme}
        />
      </Paper>
    </Box>
  );
};

export default CalendarPage;
