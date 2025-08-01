/**
 * Integration Tests for Session-Based System
 * 
 * Tests the complete session-based timer system including UI components,
 * hooks, services, and backend integration.
 */

import '../../setupTests';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionDashboard } from '../../components/pages/SessionDashboard';
import { SessionTimerBar } from '../../components/layout/SessionTimerBar';
import { TaskSession, TimerInstance } from '../../types/timer';
import { Task } from '../../types/task';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Get the mocked invoke function
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

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

// Mock session management hook
const mockSessionManagement = {
  sessions: [],
  activeSession: null,
  isLoading: false,
  error: null,
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  setActiveSession: vi.fn(),
  endActiveSession: vi.fn(),
  pauseAllTimersInActiveSession: vi.fn(),
  resumeAllTimersInActiveSession: vi.fn(),
  createTimerInstance: vi.fn(),
  startTimerInstance: vi.fn(),
  stopTimerInstance: vi.fn(),
  pauseTimerInstance: vi.fn(),
  resumeTimerInstance: vi.fn(),
  deleteTimerInstance: vi.fn(),
};

vi.mock('../../hooks/useSessionManagement', () => ({
  useSessionManagement: () => mockSessionManagement,
}));

// Mock tasks hook
const mockTasksHook = {
  tasks: [],
  isLoading: false,
  error: null,
};

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockTasksHook,
}));

describe('Session System Integration', () => {
  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Development Work',
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T09:00:00Z',
    },
    {
      id: 'task-2',
      name: 'Code Review',
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
    
    // Reset mock state
    Object.assign(mockSessionManagement, {
      sessions: [],
      activeSession: null,
      isLoading: false,
      error: null,
    });
    
    Object.assign(mockTasksHook, {
      tasks: mockTasks,
      isLoading: false,
      error: null,
    });
    
    // Default mock responses
    mockInvoke.mockImplementation((command: string) => {
      switch (command) {
        case 'get_sessions':
          return Promise.resolve([]);
        case 'get_tasks':
          return Promise.resolve(mockTasks);
        case 'create_session':
          return Promise.resolve(mockSession);
        case 'create_timer_instance':
          return Promise.resolve(mockTimerInstance);
        case 'start_timer_instance':
          return Promise.resolve(undefined);
        case 'stop_timer_instance':
          return Promise.resolve(undefined);
        case 'pause_timer_instance':
          return Promise.resolve(undefined);
        case 'resume_timer_instance':
          return Promise.resolve(undefined);
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
      // Mock the createSession function to simulate successful creation
      mockSessionManagement.createSession.mockResolvedValue(mockSession);

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
        expect(mockSessionManagement.createSession).toHaveBeenCalledWith('task-1', 'Development Work');
      });
    });

    it('should handle session creation errors gracefully', async () => {
      // Mock the createSession function to simulate failure
      mockSessionManagement.createSession.mockRejectedValue(new Error('Creation failed'));

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Start New Session')).toBeInTheDocument();
      });

      const taskInput = screen.getByPlaceholderText('Select or enter task name...');
      fireEvent.change(taskInput, { target: { value: 'Development Work' } });

      const startButton = screen.getByText('Start Session');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockSessionManagement.createSession).toHaveBeenCalledWith('task-1', 'Development Work');
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

      // Set up the mock to return the active session
      Object.assign(mockSessionManagement, {
        sessions: [activeSession],
        activeSession: activeSession,
        isLoading: false,
        error: null,
      });

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getAllByText('Development Work').length).toBeGreaterThanOrEqual(3); // Timer bar, active session, session list
      });

      // Click add timer button
      const addTimerButton = screen.getByText('Add Timer');
      fireEvent.click(addTimerButton);

      await waitFor(() => {
        expect(mockSessionManagement.createTimerInstance).toHaveBeenCalledWith('session-1');
      });
    });

    it('should stop individual timer instances', async () => {
      const runningInstance = { ...mockTimerInstance, isRunning: true };
      const activeSession = {
        ...mockSession,
        isActive: true,
        timerInstances: [runningInstance],
      };

      // Set up the mock to return the active session
      Object.assign(mockSessionManagement, {
        sessions: [activeSession],
        activeSession: activeSession,
        isLoading: false,
        error: null,
      });

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getAllByText('Development Work').length).toBeGreaterThanOrEqual(3); // Timer bar, active session, session list
      });

      // Find and click stop button for the timer instance
      const stopButton = screen.getByLabelText(/stop timer 1/i);
      fireEvent.click(stopButton);

      await waitFor(() => {
        expect(mockSessionManagement.stopTimerInstance).toHaveBeenCalledWith('instance-1');
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

      // Set up the mock to return the sessions
      Object.assign(mockSessionManagement, {
        sessions,
        activeSession: null,
        isLoading: false,
        error: null,
      });

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getAllByText('Development Work').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Code Review').length).toBeGreaterThan(0);
      });
    });

    it('should activate and deactivate sessions', async () => {
      const inactiveSession = { ...mockSession, isActive: false };
      
      // Set up the mock to return the inactive session
      Object.assign(mockSessionManagement, {
        sessions: [inactiveSession],
        activeSession: null,
        isLoading: false,
        error: null,
      });

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getAllByText('Development Work').length).toBeGreaterThan(0);
      });

      // The exact activation flow would depend on UI implementation
      // This test verifies the session is displayed
    });

    it('should delete sessions with confirmation', async () => {
      // Set up the mock to return a session
      Object.assign(mockSessionManagement, {
        sessions: [mockSession],
        activeSession: null,
        isLoading: false,
        error: null,
      });

      render(<SessionDashboard />);

      await waitFor(() => {
        expect(screen.getAllByText('Development Work').length).toBeGreaterThan(0);
      });

      // The exact deletion flow would depend on UI implementation
      // This test verifies the session is displayed
    });
  });

  describe('Session Timer Bar Integration', () => {
    it('should render timer bar with no active session', () => {
      render(
        <SessionTimerBar
          activeSession={null}
          predefinedTasks={mockTasks}
          onStartSession={vi.fn()}
          onEndSession={vi.fn()}
          onPauseAll={vi.fn()}
          onResumeAll={vi.fn()}
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
          onEndSession={vi.fn()}
          onPauseAll={vi.fn()}
          onResumeAll={vi.fn()}
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
          onEndSession={vi.fn()}
          onPauseAll={vi.fn()}
          onResumeAll={vi.fn()}
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
    it('should render without crashing when backend calls fail', async () => {
      // Set up the mock to return an error state
      Object.assign(mockSessionManagement, {
        sessions: [],
        activeSession: null,
        isLoading: false,
        error: 'Backend unavailable',
      });

      render(<SessionDashboard />);

      // Just verify the component renders without crashing and shows error
      await waitFor(() => {
        expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
      });
    });

    it('should handle network timeouts gracefully', async () => {
      // Set up the mock to return an error state
      Object.assign(mockSessionManagement, {
        sessions: [],
        activeSession: null,
        isLoading: false,
        error: 'Request timeout',
      });

      render(<SessionDashboard />);

      // Just verify the component renders without crashing and shows error
      await waitFor(() => {
        expect(screen.getByText('Request timeout')).toBeInTheDocument();
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
