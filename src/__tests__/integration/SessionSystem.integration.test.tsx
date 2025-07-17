/**
 * Integration Tests for Session-Based System
 * 
 * Tests the complete session-based timer system including UI components,
 * hooks, services, and backend integration.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionDashboard } from '../../components/pages/SessionDashboard';
import { SessionTimerBar } from '../../components/layout/SessionTimerBar';
import { TaskSession, TimerInstance } from '../../types/timer';
import { Task } from '../../types/task';

// Mock Tauri API
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mockInvoke,
}));

// Mock notification context
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock inactivity detection
vi.mock('../../hooks/useInactivityDetection', () => ({
  useInactivityDetection: () => ({
    isWarningShown: false,
    warningTimeRemaining: 0,
    settings: {
      enabled: true,
      thresholdMinutes: 15,
      showWarningBeforePause: true,
      warningDurationSeconds: 30,
      resumeOnActivity: false,
    },
  }),
}));

// Mock timer hook
vi.mock('../../hooks/useTimer', () => ({
  useTimer: (isRunning: boolean) => (isRunning ? 1000 : 0), // 1 second elapsed
}));

describe('Session System Integration', () => {
  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Development Work',
      description: 'Software development tasks',
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T09:00:00Z',
    },
    {
      id: 'task-2',
      name: 'Code Review',
      description: 'Review pull requests',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    },
  ];

  const mockSession: TaskSession = {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Development Work',
    timerInstances: [],
    totalDuration: 0,
    isActive: false,
    date: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockTimerInstance: TimerInstance = {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date('2024-01-15T10:00:00Z'),
    isRunning: false,
    isPaused: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock responses
    mockInvoke.mockImplementation((command: string) => {
      switch (command) {
        case 'get_sessions':
          return Promise.resolve([]);
        case 'get_tasks':
          return Promise.resolve(mockTasks);
        default:
          return Promise.resolve(null);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Session Creation Flow', () => {
    it('should create a new session and start timer', async () => {
      const newSession = { ...mockSession, isActive: true };
      const newInstance = { ...mockTimerInstance, isRunning: true };

      mockInvoke
        .mockResolvedValueOnce([]) // get_sessions
        .mockResolvedValueOnce(mockTasks) // get_tasks
        .mockResolvedValueOnce(newSession) // create_session
        .mockResolvedValueOnce(newInstance) // create_timer_instance
        .mockResolvedValueOnce(undefined) // start_timer_instance
        .mockResolvedValueOnce([{ ...newSession, timerInstances: [newInstance] }]); // reload sessions

      render(<SessionDashboard />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Start New Session')).toBeInTheDocument();
      });

      // Enter task name
      const taskInput = screen.getByPlaceholderText('Select or enter task name...');
      fireEvent.change(taskInput, { target: { value: 'Development Work' } });

      // Start session
      const startButton = screen.getByText('Start Session');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('create_session', {
          taskId: 'task-1',
          taskName: 'Development Work',
        });
        expect(mockInvoke).toHaveBeenCalledWith('create_timer_instance', {
          sessionId: 'session-1',
        });
        expect(mockInvoke).toHaveBeenCalledWith('start_timer_instance', {
          instanceId: 'instance-1',
        });
      });

      expect(mockShowSuccess).toHaveBeenCalledWith('Session created for "Development Work"');
    });

    it('should handle session creation errors gracefully', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // get_sessions
        .mockResolvedValueOnce(mockTasks) // get_tasks
        .mockRejectedValueOnce(new Error('Creation failed')); // create_session fails

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Start New Session')).toBeInTheDocument();
      });

      const taskInput = screen.getByPlaceholderText('Select or enter task name...');
      fireEvent.change(taskInput, { target: { value: 'Development Work' } });

      const startButton = screen.getByText('Start Session');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Failed to start session');
      });
    });
  });

  describe('Timer Instance Management', () => {
    it('should add multiple timer instances to a session', async () => {
      const activeSession = {
        ...mockSession,
        isActive: true,
        timerInstances: [mockTimerInstance],
      };

      const newInstance = {
        ...mockTimerInstance,
        id: 'instance-2',
        isRunning: true,
      };

      mockInvoke
        .mockResolvedValueOnce([activeSession]) // get_sessions
        .mockResolvedValueOnce(mockTasks) // get_tasks
        .mockResolvedValueOnce(newInstance) // create_timer_instance
        .mockResolvedValueOnce(undefined) // start_timer_instance
        .mockResolvedValueOnce([{
          ...activeSession,
          timerInstances: [mockTimerInstance, newInstance],
        }]); // reload sessions

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Development Work')).toBeInTheDocument();
      });

      // Click add timer button
      const addTimerButton = screen.getByText('Add Timer');
      fireEvent.click(addTimerButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('create_timer_instance', {
          sessionId: 'session-1',
        });
        expect(mockInvoke).toHaveBeenCalledWith('start_timer_instance', {
          instanceId: 'instance-2',
        });
      });
    });

    it('should stop individual timer instances', async () => {
      const runningInstance = { ...mockTimerInstance, isRunning: true };
      const activeSession = {
        ...mockSession,
        isActive: true,
        timerInstances: [runningInstance],
      };

      mockInvoke
        .mockResolvedValueOnce([activeSession]) // get_sessions
        .mockResolvedValueOnce(mockTasks) // get_tasks
        .mockResolvedValueOnce(undefined) // stop_timer_instance
        .mockResolvedValueOnce([{
          ...activeSession,
          timerInstances: [{ ...runningInstance, isRunning: false, duration: 3600000 }],
        }]); // reload sessions

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Development Work')).toBeInTheDocument();
      });

      // Find and click stop button for the timer instance
      const stopButton = screen.getByLabelText(/stop/i);
      fireEvent.click(stopButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('stop_timer_instance', {
          instanceId: 'instance-1',
        });
      });
    });
  });

  describe('Session Management', () => {
    it('should display session list with proper information', async () => {
      const sessions = [
        mockSession,
        {
          ...mockSession,
          id: 'session-2',
          taskName: 'Code Review',
          totalDuration: 7200000, // 2 hours
          timerInstances: [
            { ...mockTimerInstance, id: 'instance-2', duration: 7200000 },
          ],
        },
      ];

      mockInvoke
        .mockResolvedValueOnce(sessions) // get_sessions
        .mockResolvedValueOnce(mockTasks); // get_tasks

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Development Work')).toBeInTheDocument();
        expect(screen.getByText('Code Review')).toBeInTheDocument();
        expect(screen.getByText('2:00:00')).toBeInTheDocument(); // 2 hours formatted
      });
    });

    it('should activate and deactivate sessions', async () => {
      const inactiveSession = { ...mockSession, isActive: false };
      
      mockInvoke
        .mockResolvedValueOnce([inactiveSession]) // get_sessions
        .mockResolvedValueOnce(mockTasks) // get_tasks
        .mockResolvedValueOnce(undefined) // update_session (activate)
        .mockResolvedValueOnce([{ ...inactiveSession, isActive: true }]); // reload sessions

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Development Work')).toBeInTheDocument();
      });

      // Click on session to select it, then activate
      const sessionCard = screen.getByText('Development Work').closest('[role="button"]');
      if (sessionCard) {
        fireEvent.click(sessionCard);
      }

      // This would trigger session activation through the UI
      // The exact implementation depends on the UI design
    });

    it('should delete sessions with confirmation', async () => {
      mockInvoke
        .mockResolvedValueOnce([mockSession]) // get_sessions
        .mockResolvedValueOnce(mockTasks) // get_tasks
        .mockResolvedValueOnce(undefined) // delete_session
        .mockResolvedValueOnce([]); // reload sessions (empty after deletion)

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Development Work')).toBeInTheDocument();
      });

      // The exact deletion flow would depend on UI implementation
      // This is a placeholder for the deletion test
    });
  });

  describe('Session Timer Bar Integration', () => {
    it('should render timer bar with no active session', () => {
      render(
        <SessionTimerBar
          activeSession={null}
          predefinedTasks={mockTasks}
          onStartSession={vi.fn()}
          onStopSession={vi.fn()}
          onCreateTimerInstance={vi.fn()}
          onStartTimer={vi.fn()}
          onStopTimer={vi.fn()}
          onPauseTimer={vi.fn()}
          onResumeTimer={vi.fn()}
        />
      );

      expect(screen.getByText('Start New Session')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Select or enter task name...')).toBeInTheDocument();
    });

    it('should render timer bar with active session', () => {
      const activeSession = {
        ...mockSession,
        isActive: true,
        timerInstances: [{ ...mockTimerInstance, isRunning: true }],
        totalDuration: 3600000, // 1 hour
      };

      render(
        <SessionTimerBar
          activeSession={activeSession}
          predefinedTasks={mockTasks}
          onStartSession={vi.fn()}
          onStopSession={vi.fn()}
          onCreateTimerInstance={vi.fn()}
          onStartTimer={vi.fn()}
          onStopTimer={vi.fn()}
          onPauseTimer={vi.fn()}
          onResumeTimer={vi.fn()}
        />
      );

      expect(screen.getByText('Development Work')).toBeInTheDocument();
      expect(screen.getByText('1 timer')).toBeInTheDocument();
      expect(screen.getByText('End Session')).toBeInTheDocument();
    });

    it('should handle timer controls correctly', async () => {
      const onStartTimer = vi.fn();
      const onStopTimer = vi.fn();
      const onPauseTimer = vi.fn();

      const activeSession = {
        ...mockSession,
        isActive: true,
        timerInstances: [{ ...mockTimerInstance, isRunning: true }],
      };

      render(
        <SessionTimerBar
          activeSession={activeSession}
          predefinedTasks={mockTasks}
          onStartSession={vi.fn()}
          onStopSession={vi.fn()}
          onCreateTimerInstance={vi.fn()}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
          onPauseTimer={onPauseTimer}
          onResumeTimer={vi.fn()}
        />
      );

      // Test timer controls
      const pauseButton = screen.getByLabelText(/pause/i);
      fireEvent.click(pauseButton);
      expect(onPauseTimer).toHaveBeenCalledWith('instance-1');

      const stopButton = screen.getByLabelText(/stop/i);
      fireEvent.click(stopButton);
      expect(onStopTimer).toHaveBeenCalledWith('instance-1');
    });
  });

  describe('Error Handling', () => {
    it('should display error messages when backend calls fail', async () => {
      mockInvoke
        .mockRejectedValueOnce(new Error('Backend unavailable')) // get_sessions fails
        .mockResolvedValueOnce(mockTasks); // get_tasks succeeds

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Backend unavailable/)).toBeInTheDocument();
      });
    });

    it('should handle network timeouts gracefully', async () => {
      const timeoutError = new Error('Request timeout');
      mockInvoke.mockRejectedValue(timeoutError);

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalled();
      });
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of sessions efficiently', async () => {
      const largeSessions = Array.from({ length: 100 }, (_, i) => ({
        ...mockSession,
        id: `session-${i}`,
        taskName: `Task ${i}`,
      }));

      mockInvoke
        .mockResolvedValueOnce(largeSessions) // get_sessions
        .mockResolvedValueOnce(mockTasks); // get_tasks

      const startTime = performance.now();
      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('All Sessions')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (less than 1 second)
      expect(renderTime).toBeLessThan(1000);
    });
  });
});
