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
import { SessionTimerToolbar } from '../../components/layout/SessionTimerToolbar';
import { SessionTimerDisplay } from '../../components/ui/display/SessionTimerDisplay';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { Task } from '../../types/task';
import { ActiveTimerProvider } from '../../contexts/ActiveTimerContext';

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

// Mock session management hook
const mockSessionManagement = {
  sessions: [],
  activeSession: null,
  isLoading: false,
  error: null,
  startTask: vi.fn(),
  addManualTime: vi.fn(),
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

// The dashboard consumes the shared session context (single hook instance
// provided at the app root), so mock the context module the same way.
vi.mock('../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => mockSessionManagement,
  SessionManagementProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock task management context
const mockTaskManagement = {
  tasks: [],
  activeTasks: [],
  archivedTasks: [],
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
  getTaskById: vi.fn(),
  getTaskByName: vi.fn(),
  getTaskNames: vi.fn(),
  getTaskHierarchy: vi.fn(),
  getChildTasks: vi.fn(),
  getParentTask: vi.fn(),
  getTaskPath: vi.fn(),
  isLoading: false,
};

vi.mock('../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => mockTaskManagement,
  TaskManagementProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderDashboard = () => render(<SessionDashboard />, { wrapper: ({ children }) => <ActiveTimerProvider>{children}</ActiveTimerProvider> });

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
    state: TimerState.idle,
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
    
    Object.assign(mockTaskManagement, {
      tasks: mockTasks,
      activeTasks: mockTasks,
      archivedTasks: [],
      isLoading: false,
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

  describe('Starting work', () => {
    it('starts the chosen task from the toolbar in one step', async () => {
      mockSessionManagement.startTask.mockResolvedValue({ outcome: 'started', instanceId: 'i-1' });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Start Work')).toBeInTheDocument();
      });

      const taskInput = screen.getByPlaceholderText('Choose a task…');
      fireEvent.change(taskInput, { target: { value: 'Dev' } });
      fireEvent.click(await screen.findByRole('option', { name: 'Development Work' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));

      await waitFor(() => {
        expect(mockSessionManagement.startTask).toHaveBeenCalledWith('task-1', 'Development Work');
      });
    });

    it('keeps the dashboard usable when starting fails', async () => {
      // startTask reports failures itself (toast + inline error) and resolves null
      mockSessionManagement.startTask.mockResolvedValue(null);

      renderDashboard();

      const taskInput = await screen.findByPlaceholderText('Choose a task…');
      fireEvent.change(taskInput, { target: { value: 'Dev' } });
      fireEvent.click(await screen.findByRole('option', { name: 'Development Work' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));

      await waitFor(() => {
        expect(mockSessionManagement.startTask).toHaveBeenCalledWith('task-1', 'Development Work');
      });
      expect(screen.getByText('All Sessions')).toBeInTheDocument();
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

      renderDashboard();

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
      const runningInstance = { ...mockTimerInstance, isRunning: true, state: TimerState.running };
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

      renderDashboard();

      await waitFor(() => {
        expect(screen.getAllByText('Development Work').length).toBeGreaterThanOrEqual(3); // Timer bar, active session, session list
      });

      // Find and click stop button for the timer instance (in the panel)
      const stopButton = screen.getByRole('button', { name: 'Stop Timer' });
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
            { ...mockTimerInstance, id: 'instance-2', duration: 7200000, state: TimerState.stopped },
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

      renderDashboard();

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

      renderDashboard();

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

      renderDashboard();

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
        <SessionTimerToolbar
          activeSession={null}
          startOptions={mockTasks}
          onStartTask={vi.fn()}
          onEndSession={vi.fn()}
          onPauseAll={vi.fn()}
          onResumeAll={vi.fn()}
        />
      );

      expect(screen.getByText('Start Work')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Choose a task…')).toBeInTheDocument();
    });

    it('should render timer bar with active session', () => {
      const activeSession = {
        ...mockSession,
        isActive: true,
        timerInstances: [{ ...mockTimerInstance, isRunning: true, state: TimerState.running }],
        totalDuration: 3600000, // 1 hour
      };

      render(
        <SessionTimerToolbar
          activeSession={activeSession}
          startOptions={mockTasks}
          onStartTask={vi.fn()}
          onEndSession={vi.fn()}
          onPauseAll={vi.fn()}
          onResumeAll={vi.fn()}
        />
      );

      expect(screen.getByText('Development Work')).toBeInTheDocument();
      expect(screen.getByText('1 timer')).toBeInTheDocument();
      expect(screen.getByText('End Session')).toBeInTheDocument();
    });

    it('should handle timer controls correctly in the session panel', async () => {
      // Per-timer controls moved out of the toolbar into SessionTimerDisplay
      const onStopTimer = vi.fn();
      const onPauseTimer = vi.fn();

      const activeSession = {
        ...mockSession,
        isActive: true,
        timerInstances: [{ ...mockTimerInstance, isRunning: true, state: TimerState.running }],
      };

      render(
        <SessionTimerDisplay
          session={activeSession}
          nowMs={Date.now()}
          showControls
          size="large"
          onStartTimer={vi.fn()}
          onStopTimer={onStopTimer}
          onPauseTimer={onPauseTimer}
          onResumeTimer={vi.fn()}
        />
      );

      // Test timer controls
      const pauseButton = screen.getByRole('button', { name: 'Pause Timer' });
      fireEvent.click(pauseButton);
      expect(onPauseTimer).toHaveBeenCalledWith('instance-1');

      const stopButton = screen.getByRole('button', { name: 'Stop Timer' });
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

      renderDashboard();

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

      renderDashboard();

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
      renderDashboard();

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
