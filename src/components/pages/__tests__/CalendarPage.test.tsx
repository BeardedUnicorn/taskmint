import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import dayjs from 'dayjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import CalendarPage from '../CalendarPage';
import { useFundsReleaseSettings } from '../../../hooks/useFundsReleaseSettings';
import { TimeEntry, Task } from '../../../types';
import { TaskSession, TimerState } from '../../../types/timer';
import { createLightTheme } from '../../../theme';

// The page reads sessions and tasks from the shared contexts
vi.mock('../../../hooks/useFundsReleaseSettings');

const mockSessionContext = {
  sessions: [] as TaskSession[],
  isLoading: false,
};
vi.mock('../../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => mockSessionContext,
}));

const mockTaskContext = {
  tasks: [] as Task[],
  isLoading: false,
};
vi.mock('../../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => mockTaskContext,
}));

// Mock react-big-calendar
vi.mock('react-big-calendar', () => ({
  Calendar: ({ events, components, dayPropGetter }: any) => {
    return (
      <div data-testid="calendar">
        {events.map((event: any) => (
          <div key={event.id} data-testid={`calendar-event-${event.id}`}>
            {components.event && components.event({ event })}
          </div>
        ))}
        <div data-testid="day-prop-getter-test">
          {dayPropGetter && JSON.stringify(dayPropGetter(new Date('2024-01-01')))}
        </div>
      </div>
    );
  },
  dayjsLocalizer: () => ({}),
  Views: {
    MONTH: 'month',
  },
}));

const mockUseFundsReleaseSettings = useFundsReleaseSettings as any;

// Build backend-shaped sessions whose flattening yields the given entries
function entriesToSessions(entries: TimeEntry[]): TaskSession[] {
  const now = '2024-01-01T00:00:00.000Z';
  return entries.map((entry, index) => ({
    id: `session-${index}`,
    taskId: entry.taskId ?? '',
    taskName: entry.taskName,
    timerInstances: [
      {
        id: entry.id,
        sessionId: `session-${index}`,
        startTime: entry.startTime,
        endTime: entry.endTime,
        duration: entry.duration,
        state: entry.isRunning
          ? TimerState.running
          : entry.duration != null
            ? TimerState.stopped
            : TimerState.idle,
        createdAt: now,
        updatedAt: now,
      },
    ],
    totalDuration: entry.duration ?? 0,
    isActive: false,
    date: entry.date,
    createdAt: now,
    updatedAt: now,
  }));
}

describe('CalendarPage', () => {
  const mockTimeEntries: TimeEntry[] = [
    {
      id: '1',
      taskName: 'Task 1',
      taskId: 'task1',
      startTime: new Date('2024-01-01T09:00:00'),
      endTime: new Date('2024-01-01T10:00:00'),
      duration: 3600000, // 1 hour in milliseconds
      isRunning: false,
      date: '2024-01-01',
    },
    {
      id: '2',
      taskName: 'Task 2',
      taskId: 'task2',
      startTime: new Date('2024-01-02T09:00:00'),
      endTime: new Date('2024-01-02T11:00:00'),
      duration: 7200000, // 2 hours in milliseconds
      isRunning: false,
      date: '2024-01-02',
    },
    {
      id: '3',
      taskName: 'Task 1',
      taskId: 'task1',
      startTime: new Date('2024-01-03T09:00:00'),
      endTime: new Date('2024-01-03T09:30:00'),
      duration: 1800000, // 30 minutes in milliseconds
      isRunning: false,
      date: '2024-01-03',
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task1',
      name: 'Task 1',
      hourlyRate: 50,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'task2',
      name: 'Task 2',
      hourlyRate: 75,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'task3',
      name: 'Task 3',
      hourlyRate: 0, // No hourly rate
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockSessionContext.sessions = entriesToSessions(mockTimeEntries);
    mockSessionContext.isLoading = false;
    mockTaskContext.tasks = mockTasks;
    mockTaskContext.isLoading = false;

    // Mock useFundsReleaseSettings
    mockUseFundsReleaseSettings.mockReturnValue({
      days: 7, // 7 days for funds release
      updateDays: vi.fn(),
    });
  });

  const lightTheme = createLightTheme();

  const renderCalendarPage = () => {
    return render(
      <ThemeProvider theme={lightTheme}>
        <CalendarPage />
      </ThemeProvider>
    );
  };

  describe('Loading State', () => {
    it('should show loading spinner while sessions are loading', () => {
      mockSessionContext.sessions = [];
      mockSessionContext.isLoading = true;

      renderCalendarPage();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Calendar Display', () => {
    it('should render calendar with current month and year', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const currentDate = new Date();
      const expectedTitle = dayjs(currentDate).format('MMMM YYYY');
      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });

    it('should render calendar navigation controls', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      expect(screen.getByLabelText('previous month')).toBeInTheDocument();
      expect(screen.getByLabelText('next month')).toBeInTheDocument();
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('should render calendar component', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('calendar')).toBeInTheDocument();
    });
  });

  describe('Earnings and Transferable Amounts', () => {
    it('should display earnings for days with time entries', async () => {
      // Use current month data for testing
      const currentDate = new Date();
      const currentMonth = dayjs(currentDate).format('YYYY-MM');
      const testEntries: TimeEntry[] = [
        {
          id: '1',
          taskName: 'Task 1',
          taskId: 'task1',
          startTime: new Date(`${currentMonth}-01T09:00:00`),
          endTime: new Date(`${currentMonth}-01T10:00:00`),
          duration: 3600000,
          isRunning: false,
          date: `${currentMonth}-01`,
        },
      ];

      mockSessionContext.sessions = entriesToSessions(testEntries);

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Check for events with earnings in current month
      expect(screen.getByTestId(`calendar-event-${currentMonth}-01`)).toBeInTheDocument();
    });

    it('should display $0.00 earnings for days without time entries', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Should have events for all days in the calendar view, including days with $0
      const calendarEvents = screen.getAllByTestId(/calendar-event-/);
      expect(calendarEvents.length).toBeGreaterThan(3); // More than just the days with actual entries

      // Check that $0.00 is displayed for days without entries
      const zeroEarnings = screen.getAllByText('$0.00');
      expect(zeroEarnings.length).toBeGreaterThan(0);
    });

    it('should calculate correct earnings based on hourly rates', async () => {
      // Use current month data for testing
      const currentDate = new Date();
      const currentMonth = dayjs(currentDate).format('YYYY-MM');
      const testEntries: TimeEntry[] = [
        {
          id: '1',
          taskName: 'Task 1',
          taskId: 'task1',
          startTime: new Date(`${currentMonth}-01T09:00:00`),
          endTime: new Date(`${currentMonth}-01T10:00:00`),
          duration: 3600000, // 1 hour
          isRunning: false,
          date: `${currentMonth}-01`,
        },
        {
          id: '2',
          taskName: 'Task 2',
          taskId: 'task2',
          startTime: new Date(`${currentMonth}-02T09:00:00`),
          endTime: new Date(`${currentMonth}-02T11:00:00`),
          duration: 7200000, // 2 hours
          isRunning: false,
          date: `${currentMonth}-02`,
        },
      ];

      mockSessionContext.sessions = entriesToSessions(testEntries);

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Task 1: 1 hour at $50/hour = $50.00
      expect(screen.getByText('$50.00')).toBeInTheDocument();

      // Task 2: 2 hours at $75/hour = $150.00
      expect(screen.getByText('$150.00')).toBeInTheDocument();
    });

    it('should calculate transferable amounts based on funds release days', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // With 7-day funds release and no historical data, transferable amounts should be $0
      const transferableTexts = screen.getAllByText(/Transferable: \$0\.00/);
      expect(transferableTexts.length).toBeGreaterThan(0);
    });

    it('should show transferable amounts when there are earnings from previous days', async () => {
      // Create test data with earnings from 7 days ago
      const currentDate = new Date();
      const currentMonth = dayjs(currentDate).format('YYYY-MM');
      const sevenDaysAgo = dayjs(`${currentMonth}-08`).subtract(7, 'day').toDate();
      const sevenDaysAgoStr = dayjs(sevenDaysAgo).format('YYYY-MM-DD');

      const testEntries: TimeEntry[] = [
        {
          id: '1',
          taskName: 'Task 1',
          taskId: 'task1',
          startTime: new Date(`${sevenDaysAgoStr}T09:00:00`),
          endTime: new Date(`${sevenDaysAgoStr}T10:00:00`),
          duration: 3600000, // 1 hour
          isRunning: false,
          date: sevenDaysAgoStr,
        },
        {
          id: '2',
          taskName: 'Task 1',
          taskId: 'task1',
          startTime: new Date(`${currentMonth}-08T09:00:00`),
          endTime: new Date(`${currentMonth}-08T10:00:00`),
          duration: 3600000, // 1 hour
          isRunning: false,
          date: `${currentMonth}-08`,
        },
      ];

      mockSessionContext.sessions = entriesToSessions(testEntries);

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // The 8th should show transferable amount from 7 days earlier
      expect(screen.getAllByText('Transferable: $50.00').length).toBeGreaterThan(0);
    });
  });

  describe('Navigation', () => {
    it('should navigate to previous month when clicking previous button', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const currentDate = new Date();
      const prevButton = screen.getByLabelText('previous month');

      fireEvent.click(prevButton);

      const expectedTitle = dayjs(currentDate).subtract(1, 'month').format('MMMM YYYY');
      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });

    it('should navigate to next month when clicking next button', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const currentDate = new Date();
      const nextButton = screen.getByLabelText('next month');

      fireEvent.click(nextButton);

      const expectedTitle = dayjs(currentDate).add(1, 'month').format('MMMM YYYY');
      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });

    it('should navigate to current month when clicking Today button', async () => {
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // First navigate to a different month
      const nextButton = screen.getByLabelText('next month');
      fireEvent.click(nextButton);

      // Then click Today
      const todayButton = screen.getByText('Today');
      fireEvent.click(todayButton);

      const expectedTitle = dayjs(new Date()).format('MMMM YYYY');
      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty sessions', async () => {
      mockSessionContext.sessions = [];

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Should still render calendar with $0.00 for all days
      expect(screen.getByTestId('calendar')).toBeInTheDocument();
      const zeroEarnings = screen.getAllByText('$0.00');
      expect(zeroEarnings.length).toBeGreaterThan(0);
    });

    it('should handle tasks without hourly rates', async () => {
      const entriesWithNoRateTask: TimeEntry[] = [
        {
          id: '1',
          taskName: 'Task 3',
          taskId: 'task3',
          startTime: new Date('2024-01-01T09:00:00'),
          endTime: new Date('2024-01-01T10:00:00'),
          duration: 3600000,
          isRunning: false,
          date: '2024-01-01',
        },
      ];

      mockSessionContext.sessions = entriesToSessions(entriesWithNoRateTask);

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Should show $0.00 for tasks without hourly rates
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });

    it('should handle running time entries', async () => {
      const runningEntries: TimeEntry[] = [
        {
          id: '1',
          taskName: 'Task 1',
          taskId: 'task1',
          startTime: new Date('2024-01-01T09:00:00'),
          endTime: undefined,
          duration: undefined,
          isRunning: true,
          date: '2024-01-01',
        },
      ];

      mockSessionContext.sessions = entriesToSessions(runningEntries);

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Running entries should not contribute to earnings
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });
  });

  describe('Funds Release Settings Integration', () => {
    it('should update transferable amounts when funds release days change', async () => {
      const { rerender } = renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Change funds release days
      mockUseFundsReleaseSettings.mockReturnValue({
        days: 14, // Change to 14 days
        updateDays: vi.fn(),
      });

      rerender(
        <ThemeProvider theme={lightTheme}>
          <CalendarPage />
        </ThemeProvider>
      );

      // The component should recalculate transferable amounts with new settings
      expect(screen.getByTestId('calendar')).toBeInTheDocument();
    });
  });

  describe('Calendar Event Component', () => {
    it('should display earnings and transferable amounts in event component', async () => {
      // Use current month data for testing
      const currentDate = new Date();
      const currentMonth = dayjs(currentDate).format('YYYY-MM');
      const testEntries: TimeEntry[] = [
        {
          id: '1',
          taskName: 'Task 1',
          taskId: 'task1',
          startTime: new Date(`${currentMonth}-01T09:00:00`),
          endTime: new Date(`${currentMonth}-01T10:00:00`),
          duration: 3600000, // 1 hour
          isRunning: false,
          date: `${currentMonth}-01`,
        },
      ];

      mockSessionContext.sessions = entriesToSessions(testEntries);

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Check that both earnings and transferable amounts are displayed
      expect(screen.getByText('$50.00')).toBeInTheDocument();
      expect(screen.getAllByText(/Transferable: \$/).length).toBeGreaterThan(0);
    });
  });
});
