import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, Paper, CircularProgress, IconButton, useTheme, Button } from '@mui/material';
import { format, addMonths, subMonths, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
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

  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(currentDate);
    }
  }, [currentDate]);

  const dailyData = useMemo(() => {
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
        date: dateStr,
        earned,
        transferable,
      };
    });
  }, [timeEntries, tasks, fundsReleaseDays]);

  const handlePrevMonth = () => {
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const renderDayCell = (info: any) => {
    const dateStr = format(info.date, 'yyyy-MM-dd');
    const dayData = dailyData.find(d => d.date === dateStr);

    return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            height: '100%',
            padding: '4px',
            fontSize: '12px',
            lineHeight: 1.2,
          }}
        >
          <Box sx={{ fontSize: '14px', fontWeight: 'bold', mb: 0.5 }}>
            {format(info.date, 'd')}
          </Box>
          {dayData && (
            <>
              <Box
                sx={{
                  fontWeight: 'bold',
                  color: theme.palette.primary.main,
                  mb: 0.5,
                }}
              >
                Earned: {dayData.earned.toFixed(2)}
              </Box>
              <Box
                sx={{
                  color: theme.palette.success.main,
                  fontSize: '10px',
                }}
              >
                Transferable: {dayData.transferable.toFixed(2)}
              </Box>
            </>
          )}
        </Box>
    );
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
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          initialDate={currentDate}
          headerToolbar={false}
          height="auto"
          fixedWeekCount={false}
          dayCellContent={renderDayCell}
          themeSystem="standard"
          customButtons={{
            prev: {
              text: 'prev',
              click: handlePrevMonth,
            },
            next: {
              text: 'next',
              click: handleNextMonth,
            },
            today: {
              text: 'today',
              click: handleToday,
            },
          }}
          dayHeaderContent={(info) => (
            <Box
              sx={{
                fontWeight: 'bold',
                textAlign: 'center',
                backgroundColor: theme.palette.background.paper,
                padding: '4px 0',
                margin: 'auto'
              }}
            >
              {format(info.date, 'eee')}
            </Box>
          )}
          dayCellClassNames={(info) => {
            const dateStr = format(info.date, 'yyyy-MM-dd');
            const hasData = dailyData.some(d => d.date === dateStr);
            return hasData ? 'has-data' : '';
          }}
          eventContent={(eventInfo) => {
            return (
              <Box
                sx={{
                  backgroundColor: theme.palette.background.paper,
                  color: theme.palette.primary.contrastText,
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontSize: '12px',
                }}
              >
                {eventInfo.event.title}
              </Box>
            );
          }}
        />
      </Paper>
    </Box>
  );
};

export default CalendarPage;
