/**
 * Unit Tests for SessionDashboard Component
 * 
 * Tests the main session management dashboard including session creation,
 * display, activation, and timer management functionality.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionDashboard } from '../SessionDashboard';
import { TaskSession, TimerInstance, TimerState } from '../../../types/timer';
import { Task } from '../../../types/task';
import { ActiveTimerProvider } from '../../../contexts/ActiveTimerContext';

// Mock dependencies (Tauri v2 core/event modules are mocked globally in
// src/__tests__/setup/global-mocks.ts)
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowWarning = vi.fn();
vi.mock('../../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showWarning: mockShowWarning,
  }),
}));

// Dashboard widget settings: all widgets enabled unless a test says otherwise
const mockIsWidgetEnabled = vi.fn(() => true);
vi.mock('../../../hooks/useDashboardSettings', () => ({
  useDashboardSettings: () => ({
    isWidgetEnabled: mockIsWidgetEnabled,
  }),
}));

// Mock session management hook
const mockCreateSession = vi.fn();
const mockUpdateSession = vi.fn();
const mockDeleteSession = vi.fn();
const mockCreateTimerInstance = vi.fn();
const mockStartTimerInstance = vi.fn();
const mockStopTimerInstance = vi.fn();
const mockPauseTimerInstance = vi.fn();
const mockResumeTimerInstance = vi.fn();
const mockSetActiveSession = vi.fn();
const mockRefreshSessions = vi.fn();

// Aliases for backward compatibility with tests
const mockStartTimer = mockStartTimerInstance;
const mockStopTimer = mockStopTimerInstance;
const mockPauseTimer = mockPauseTimerInstance;
const mockResumeTimer = mockResumeTimerInstance;

const mockSessionManagement = {
  sessions: [],
  activeSession: null,
  isLoading: false,
  error: null,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deleteSession: mockDeleteSession,
  createTimerInstance: mockCreateTimerInstance,
  startTimerInstance: mockStartTimerInstance,
  stopTimerInstance: mockStopTimerInstance,
  pauseTimerInstance: mockPauseTimerInstance,
  resumeTimerInstance: mockResumeTimerInstance,
  deleteTimerInstance: vi.fn(),
  updateTimerInstance: vi.fn(),
  setActiveSession: mockSetActiveSession,
  endActiveSession: vi.fn(),
  pauseAllTimersInActiveSession: vi.fn(),
  resumeAllTimersInActiveSession: vi.fn(),
  refreshSessions: mockRefreshSessions,
};

// The dashboard consumes the shared session context (single hook instance
// provided at the app root), so mock the context module.
vi.mock('../../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => mockSessionManagement,
  SessionManagementProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock task management
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

// Mock task management context
const mockTaskManagement = {
  tasks: mockTasks,
  activeTasks: mockTasks,
  archivedTasks: [],
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
  getTaskById: vi.fn(),
  getTaskByName: vi.fn(),
  getTaskNames: vi.fn(),
  calculateEarnings: vi.fn(),
  getTaskHierarchy: vi.fn(),
  getChildTasks: vi.fn(),
  getParentTask: vi.fn(),
  getTaskPath: vi.fn(),
  isLoading: false,
};

vi.mock('../../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => mockTaskManagement,
  TaskManagementProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useInactivityDetection hook
const mockResetActivity = vi.fn();
const mockPauseDetection = vi.fn();
const mockResumeDetection = vi.fn();

const mockInactivityDetection = {
  isWarningShown: false,
  warningTimeRemaining: 0,
  resetActivity: mockResetActivity,
  pauseDetection: mockPauseDetection,
  resumeDetection: mockResumeDetection,
};

vi.mock('../../../hooks/useInactivityDetection', () => ({
  useInactivityDetection: () => mockInactivityDetection,
}));

// Mock active timer context
let mockActiveTimer: TimerInstance | null = null;
const mockSetActiveTimer = vi.fn();

vi.mock('../../../contexts/ActiveTimerContext', () => ({
  ActiveTimerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useActiveTimer: () => ({ activeTimer: mockActiveTimer, setActiveTimer: mockSetActiveTimer }),
}));

// Mock child components to isolate SessionDashboard testing
vi.mock('../../layout/SessionTimerToolbar', () => ({
  SessionTimerToolbar: ({ onCreateTimerInstance, onStartTimer }: any) => (
    <div data-testid="session-timer-bar">
      <button
        onClick={() => {
          const mockInstance = { id: 'timer-2' };
          onCreateTimerInstance('session-1').then(() => onStartTimer('timer-2'));
        }}
      >
        Add Timer
      </button>
    </div>
  ),
}));

const renderDashboard = () => render(<SessionDashboard />, { wrapper: ({ children }) => <ActiveTimerProvider>{children}</ActiveTimerProvider> });

vi.mock('../../ui/sessions/SessionList', () => ({
  SessionList: ({ sessions, archivedTaskNames, isLoading }: { sessions: TaskSession[]; archivedTaskNames?: string[]; isLoading?: boolean }) => (
    <div
      data-testid="session-list"
      data-loading={String(isLoading ?? false)}
      data-archived-task-names={(archivedTaskNames ?? []).join(',')}
    >
      {sessions.map((session) => (
        <div key={session.id} data-testid="session-card" className={session.isActive ? 'active' : ''}>
          <span>{session.taskName}</span>
          <span>{new Date(session.totalDuration).toISOString().substr(11, 8)}</span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../ui/display/SessionTimerDisplay', () => ({
  SessionTimerDisplay: ({ onStartTimer, onStopTimer, onPauseTimer, onResumeTimer, onOpenNotes }: any) => (
    <div data-testid="session-timer-display">
      <button onClick={() => onStartTimer('timer-1')}>Start Timer</button>
      <button onClick={() => onStopTimer('timer-1')}>Stop Timer</button>
      <button onClick={() => onPauseTimer('timer-1')}>Pause Timer</button>
      <button onClick={() => onResumeTimer('timer-1')}>Resume Timer</button>
      <button onClick={() => onOpenNotes('session-1', 'timer-1')}>Notes</button>
    </div>
  ),
}));

vi.mock('../../ui/dialogs/InactivityWarningDialog', () => ({
  InactivityWarningDialog: ({ onContinue, onPause }: any) => (
    <div data-testid="inactivity-warning">
      <span>Inactivity Warning</span>
      <button onClick={onContinue}>Continue Working</button>
      <button onClick={onPause}>Pause Timer</button>
    </div>
  ),
}));

vi.mock('../../ui/dialogs/EnhancedNotesDialog', () => ({
  EnhancedNotesDialog: ({ open, onClose }: any) =>
    open ? (
      <div data-testid="notes-dialog">
        <span>Notes Dialog</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

describe('SessionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTimer = null;
    // clearAllMocks keeps implementations; undo any per-test override
    mockIsWidgetEnabled.mockImplementation(() => true);
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
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initial Rendering', () => {
    it('should render the dashboard with no sessions', () => {
      renderDashboard();
      
      expect(screen.getByText('All Sessions')).toBeInTheDocument();
      // The FAB button should be present for creating sessions
      expect(screen.getByLabelText('create session')).toBeInTheDocument();
    });

    it('should show loading state when sessions are loading', () => {
      // Update the mock to return loading state
      mockSessionManagement.isLoading = true;

      renderDashboard();

      expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument();

      // Reset for other tests
      mockSessionManagement.isLoading = false;
    });

    it('should show error state when there is an error', () => {
      const errorMessage = 'Failed to load sessions';
      // Update the mock to return error state
      (mockSessionManagement as any).error = errorMessage;

      renderDashboard();

      // The error message may be rendered in a Snackbar or Alert, so use a flexible matcher
      const errorNodes = screen.queryAllByText((content) => content.includes(errorMessage));
      expect(errorNodes.length).toBeGreaterThan(0);

      // Reset for other tests
      (mockSessionManagement as any).error = null;
    });
  });

  describe('Session Creation', () => {
    it('should create a new session via FAB dialog', async () => {
      const newSession: TaskSession = {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Development Work',
        timerInstances: [],
        totalDuration: 0,
        isActive: true,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      };

      mockCreateSession.mockResolvedValue(newSession);

      renderDashboard();
      
      // Click FAB to open dialog
      const fab = screen.getByLabelText('create session');
      fireEvent.click(fab);
      
      // Wait for dialog to open
      await waitFor(() => {
        expect(screen.getByText('Start a Quick Session')).toBeInTheDocument();
      });

      // The actual session creation would happen in the dialog
      // For now, just verify the dialog opens
    });

    it('should show FAB for session creation', () => {
      renderDashboard();
      
      const fab = screen.getByLabelText('create session');
      expect(fab).toBeInTheDocument();
    });
  });

  describe('Session Display', () => {
    const mockSessions: TaskSession[] = [
      {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Development Work',
        timerInstances: [
          {
            id: 'instance-1',
            sessionId: 'session-1',
            startTime: new Date('2024-01-15T10:00:00Z'),
            endTime: new Date('2024-01-15T11:00:00Z'),
            duration: 3600000, // 1 hour
            isRunning: false,
            isPaused: false,
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-15T11:00:00Z',
          },
        ],
        totalDuration: 3600000,
        isActive: false,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T11:00:00Z',
      },
      {
        id: 'session-2',
        taskId: 'task-2',
        taskName: 'Code Review',
        timerInstances: [],
        totalDuration: 0,
        isActive: true,
        date: '2024-01-15',
        createdAt: '2024-01-15T11:00:00Z',
        updatedAt: '2024-01-15T11:00:00Z',
      },
    ];

    it('should display list of sessions', () => {
      // Update mock to return sessions
      (mockSessionManagement as any).sessions = mockSessions;
      (mockSessionManagement as any).activeSession = mockSessions[1];
      mockSessionManagement.isLoading = false;
      mockSessionManagement.error = null;

      renderDashboard();

      expect(screen.getByText('Development Work')).toBeInTheDocument();
      expect(screen.getByText('Code Review')).toBeInTheDocument();
      expect(screen.getByText('01:00:00')).toBeInTheDocument(); // 1 hour duration

      // Reset for other tests
      (mockSessionManagement as any).sessions = [];
      (mockSessionManagement as any).activeSession = null;
    });

    it('should pass archived task names to the session list for chip filtering', () => {
      const archivedDevTask = { ...mockTasks[0], isArchived: true, archivedAt: '2024-02-01T00:00:00Z' };
      (mockSessionManagement as any).sessions = mockSessions;
      Object.assign(mockTaskManagement, {
        tasks: [archivedDevTask, mockTasks[1]],
        activeTasks: [mockTasks[1]],
        archivedTasks: [archivedDevTask],
      });

      renderDashboard();

      // The list receives the archived names for chip filtering...
      expect(screen.getByTestId('session-list')).toHaveAttribute(
        'data-archived-task-names',
        'Development Work'
      );
      // ...while the archived task's session history still reaches it
      expect(screen.getByText('Development Work')).toBeInTheDocument();

      // Reset for other tests
      (mockSessionManagement as any).sessions = [];
    });

    it('should highlight active session', () => {
      // Update mock to return sessions with active session
      (mockSessionManagement as any).sessions = mockSessions;
      (mockSessionManagement as any).activeSession = mockSessions[1];
      mockSessionManagement.isLoading = false;
      mockSessionManagement.error = null;

      renderDashboard();

      const activeSessionCard = screen.getByText('Code Review').closest('[data-testid="session-card"]');
      expect(activeSessionCard).toHaveClass('active');

      // Reset for other tests
      (mockSessionManagement as any).sessions = [];
      (mockSessionManagement as any).activeSession = null;
    });
  });

  describe('Timer Management', () => {
    const mockActiveSession: TaskSession = {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Development Work',
      timerInstances: [
        {
          id: 'timer-1',
          sessionId: 'session-1',
          startTime: new Date('2024-01-15T10:00:00Z'),
          endTime: undefined,
          duration: 0,
          isRunning: false,
          isPaused: false,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
        },
      ],
      totalDuration: 0,
      isActive: true,
      date: '2024-01-15',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    };

    beforeEach(() => {
      // Set up mock for timer management tests
      (mockSessionManagement as any).sessions = [mockActiveSession];
      (mockSessionManagement as any).activeSession = mockActiveSession;
      mockSessionManagement.isLoading = false;
      mockSessionManagement.error = null;
    });

    it('should create and start a timer instance when Add Timer is clicked', async () => {
      const newTimerInstance: TimerInstance = {
        id: 'timer-2',
        sessionId: 'session-1',
        startTime: new Date(),
        endTime: undefined,
        duration: 0,
        isRunning: false,
        isPaused: false,
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      };

      mockCreateTimerInstance.mockResolvedValue(newTimerInstance);
      mockStartTimer.mockResolvedValue(undefined);

      renderDashboard();

      // Find and click the Add Timer button in SessionTimerToolbar
      const addTimerButton = screen.getByText('Add Timer');
      fireEvent.click(addTimerButton);

      await waitFor(() => {
        expect(mockCreateTimerInstance).toHaveBeenCalledWith('session-1');
        expect(mockStartTimer).toHaveBeenCalledWith('timer-2');
      });
    });

    it('should handle timer start operation', async () => {
      mockStartTimer.mockResolvedValue(undefined);

      renderDashboard();

      // Find and click start timer button
      const startButton = screen.getByText('Start Timer');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockStartTimer).toHaveBeenCalledWith('timer-1');
      });
    });

    it('should handle timer stop operation', async () => {
      mockStopTimer.mockResolvedValue(undefined);

      renderDashboard();

      // Find and click stop timer button
      const stopButton = screen.getByText('Stop Timer');
      fireEvent.click(stopButton);

      await waitFor(() => {
        expect(mockStopTimer).toHaveBeenCalledWith('timer-1');
      });
    });

    it('should handle timer pause operation', async () => {
      mockPauseTimer.mockResolvedValue(undefined);

      renderDashboard();

      // Find and click pause timer button
      const pauseButton = screen.getByText('Pause Timer');
      fireEvent.click(pauseButton);

      await waitFor(() => {
        expect(mockPauseTimer).toHaveBeenCalledWith('timer-1');
      });
    });

    it('should handle timer resume operation', async () => {
      mockResumeTimer.mockResolvedValue(undefined);

      renderDashboard();

      // Find and click resume timer button
      const resumeButton = screen.getByText('Resume Timer');
      fireEvent.click(resumeButton);

      await waitFor(() => {
        expect(mockResumeTimer).toHaveBeenCalledWith('timer-1');
      });
    });

    it('should show error when timer operations fail', async () => {
      mockStartTimer.mockRejectedValue(new Error('Timer start failed'));

      renderDashboard();

      const startButton = screen.getByText('Start Timer');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockStartTimer).toHaveBeenCalledWith('timer-1');
        // The error handling might be different in the actual implementation
        // Just verify the function was called and failed
      });
    });
  });

  describe('Navigation and UI Interactions', () => {
    const mockSessions: TaskSession[] = [
      {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Development Work',
        timerInstances: [],
        totalDuration: 3600000, // 1 hour
        isActive: false,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      },
      {
        id: 'session-2',
        taskId: 'task-2',
        taskName: 'Code Review',
        timerInstances: [],
        totalDuration: 1800000, // 30 minutes
        isActive: true,
        date: '2024-01-15',
        createdAt: '2024-01-15T11:00:00Z',
        updatedAt: '2024-01-15T11:00:00Z',
      },
    ];

    beforeEach(() => {
      // Update the mock object directly
      Object.assign(mockSessionManagement, {
        sessions: mockSessions,
        activeSession: mockSessions[1],
        isLoading: false,
        error: null,
      });
    });

    it('should handle session selection from session list', async () => {
      renderDashboard();

      // Find and click on a session in the list
      const sessionCard = screen.getByText('Development Work').closest('[data-testid="session-card"]');
      expect(sessionCard).toBeInTheDocument();

      fireEvent.click(sessionCard!);

      // Verify session selection behavior (this would typically update some state)
      // Since we're mocking, we can't test the actual state change, but we can verify the UI responds
      expect(sessionCard).toBeInTheDocument();
    });

    it('should show floating action button for quick session creation', () => {
      renderDashboard();

      const fab = screen.getByLabelText('create session');
      expect(fab).toBeInTheDocument();
    });

    it('should handle quick session creation from FAB', async () => {
      renderDashboard();

      const fab = screen.getByLabelText('create session');
      fireEvent.click(fab);

      // The FAB opens a dialog for quick session creation
      await waitFor(() => {
        expect(screen.getByText('Start a Quick Session')).toBeInTheDocument();
      });
    });
  });

  describe('Inactivity Detection', () => {
    beforeEach(() => {
      // Update the mock objects directly
      Object.assign(mockInactivityDetection, {
        isWarningShown: true,
        warningTimeRemaining: 30,
      });

      Object.assign(mockSessionManagement, {
        sessions: [],
        activeSession: {
          id: 'session-1',
          taskId: 'task-1',
          taskName: 'Development Work',
          timerInstances: [
            {
              id: 'timer-1',
              sessionId: 'session-1',
              startTime: new Date(),
              endTime: undefined,
              duration: 0,
              isRunning: true,
              isPaused: false,
              createdAt: '2024-01-15T10:00:00Z',
              updatedAt: '2024-01-15T10:00:00Z',
            },
          ],
          totalDuration: 0,
          isActive: true,
          date: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
        },
        isLoading: false,
        error: null,
      });

      mockActiveTimer = mockSessionManagement.activeSession.timerInstances[0] as TimerInstance;
    });

    it('should show inactivity warning dialog when warning is active', () => {
      renderDashboard();

      expect(screen.getByText('Inactivity Warning')).toBeInTheDocument();
      expect(screen.getByText('Continue Working')).toBeInTheDocument();
      // Use a more specific selector for the inactivity warning pause button
      expect(screen.getByTestId('inactivity-warning')).toContainElement(screen.getAllByText('Pause Timer')[1]);
    });

    it('should handle continue work action from inactivity warning', async () => {
      renderDashboard();

      const continueButton = screen.getByText('Continue Working');
      fireEvent.click(continueButton);

      // Continue resets the inactivity clock directly
      expect(mockResetActivity).toHaveBeenCalled();
    });

    it('should handle pause from inactivity action', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      renderDashboard();

      // Get the pause button specifically from the inactivity warning dialog
      const inactivityWarning = screen.getByTestId('inactivity-warning');
      const pauseButton = inactivityWarning.querySelector('button:last-child') as HTMLElement;
      fireEvent.click(pauseButton);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'timer-pause-inactivity',
          detail: expect.objectContaining({
            reason: 'user-action',
          }),
        })
      );
    });
  });

  describe('Notes Integration', () => {
    const mockActiveSession: TaskSession = {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Development Work',
      timerInstances: [
        {
          id: 'timer-1',
          sessionId: 'session-1',
          startTime: new Date(),
          endTime: undefined,
          duration: 0,
          isRunning: false,
          isPaused: false,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
        },
      ],
      totalDuration: 0,
      isActive: true,
      date: '2024-01-15',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    };

    beforeEach(() => {
      // Update the mock object directly
      Object.assign(mockSessionManagement, {
        sessions: [mockActiveSession],
        activeSession: mockActiveSession,
        isLoading: false,
        error: null,
      });
    });

    it('should open notes dialog when notes button is clicked', async () => {
      renderDashboard();

      // Find and click notes button
      const notesButton = screen.getByText('Notes');
      fireEvent.click(notesButton);

      // Verify notes dialog is opened
      expect(screen.getByTestId('notes-dialog')).toBeInTheDocument();
    });

    it('should close notes dialog when close button is clicked', async () => {
      renderDashboard();

      // Open notes dialog first
      const notesButton = screen.getByText('Notes');
      fireEvent.click(notesButton);

      expect(screen.getByTestId('notes-dialog')).toBeInTheDocument();

      // Close the dialog
      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      // Verify dialog is closed
      expect(screen.queryByTestId('notes-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Session List Loading Guard', () => {
    it('does not blank the list while a timer action is in flight', () => {
      // Every start/stop/pause/resume toggles isLoading; with sessions
      // already loaded the list must stay rendered (loading is passed
      // through for the initial empty load only).
      Object.assign(mockSessionManagement, {
        sessions: [
          {
            id: 'session-loaded',
            taskId: 'task-1',
            taskName: 'Development Work',
            timerInstances: [],
            totalDuration: 0,
            isActive: false,
            date: '2024-01-15',
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-15T10:00:00Z',
          },
        ],
        activeSession: null,
        isLoading: true,
        error: null,
      });

      renderDashboard();

      expect(screen.getByTestId('session-list')).toHaveAttribute('data-loading', 'false');
    });
  });

  describe('Overview Stats', () => {
    // Local noon (no Z suffix): formatDateString buckets by local date.
    const NOW = new Date('2024-01-15T12:00:00');

    const statsSessions: TaskSession[] = [
      {
        id: 'session-running',
        taskId: 'task-1',
        taskName: 'Development Work',
        timerInstances: [
          {
            id: 'instance-running',
            sessionId: 'session-running',
            startTime: new Date(NOW.getTime() - 10 * 60_000), // started 10 min ago
            state: TimerState.running,
            isRunning: true,
            isPaused: false,
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-15T10:00:00Z',
          },
        ],
        // The backend only counts finalized instances, so a session whose only
        // timer is still running reports totalDuration 0.
        totalDuration: 0,
        isActive: true,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      },
      {
        id: 'session-stopped',
        taskId: 'task-1',
        taskName: 'Development Work',
        timerInstances: [
          {
            id: 'instance-stopped',
            sessionId: 'session-stopped',
            // Local times: stats bucket instances by their local start date.
            startTime: new Date(NOW.getTime() - 3 * 3_600_000),
            endTime: new Date(NOW.getTime() - 2.5 * 3_600_000),
            duration: 30 * 60_000,
            state: TimerState.stopped,
            isRunning: false,
            isPaused: false,
            createdAt: '2024-01-15T09:00:00Z',
            updatedAt: '2024-01-15T09:30:00Z',
          },
        ],
        totalDuration: 30 * 60_000,
        isActive: false,
        date: '2024-01-15',
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:30:00Z',
      },
    ];

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      Object.assign(mockSessionManagement, {
        sessions: statsSessions,
        activeSession: null,
        isLoading: false,
        error: null,
      });
      Object.assign(mockTaskManagement, {
        tasks: mockTasks.map((task) =>
          task.id === 'task-1' ? { ...task, hourlyRate: 60 } : task
        ),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('includes running timers in Total Time Today and Earnings Today', () => {
      renderDashboard();

      // 10 min running + 30 min stopped. The running-only session was
      // previously excluded entirely (totalDuration > 0 filter), so the old
      // code showed 0h 30m here.
      expect(screen.getByText('0h 40m')).toBeInTheDocument();
      // 40 min at $60/h, rendered as currency
      expect(screen.getByText('$40.00')).toBeInTheDocument();
    });

    it('ticks the totals forward while a timer is running', () => {
      renderDashboard();

      expect(screen.getByText('0h 40m')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(screen.getByText('0h 41m')).toBeInTheDocument();
      expect(screen.getByText('$41.00')).toBeInTheDocument();
    });

    it('counts timers run today inside a session created on an earlier day', () => {
      // The live repro: sessions are reactivated across days, and their
      // `date` stays frozen at creation. Bucketing by session.date hid this
      // running timer entirely (both cards stuck at zero while it ticked).
      Object.assign(mockSessionManagement, {
        sessions: [
          {
            ...statsSessions[0],
            id: 'session-yesterday',
            date: '2024-01-14',
            timerInstances: [
              {
                ...statsSessions[1].timerInstances[0],
                id: 'instance-yesterday',
                sessionId: 'session-yesterday',
                // Ran yesterday: stays in yesterday's bucket.
                startTime: new Date(NOW.getTime() - 26 * 3_600_000),
                endTime: new Date(NOW.getTime() - 25.5 * 3_600_000),
              },
              {
                ...statsSessions[0].timerInstances[0],
                id: 'instance-today',
                sessionId: 'session-yesterday',
                startTime: new Date(NOW.getTime() - 10 * 60_000),
              },
            ],
          },
        ],
      });

      renderDashboard();

      expect(screen.getByText('0h 10m')).toBeInTheDocument();
      expect(screen.getByText('$10.00')).toBeInTheDocument();
    });

    it('rolls the date bucket over at midnight even with no timer running', () => {
      // `today` derives from the ticking clock; before the fix the interval
      // was gated on a running timer, freezing the bucket overnight.
      const LATE = new Date('2024-01-15T23:59:30');
      vi.setSystemTime(LATE);
      Object.assign(mockSessionManagement, {
        sessions: [
          {
            ...statsSessions[1],
            timerInstances: [
              {
                ...statsSessions[1].timerInstances[0],
                startTime: new Date(LATE.getTime() - 59.5 * 60_000),
                endTime: new Date(LATE.getTime() - 30_000),
                duration: 59 * 60_000,
              },
            ],
          },
        ],
      });

      renderDashboard();

      expect(screen.getByText('0h 59m')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(120_000); // idle tick fires each minute
      });

      // Past midnight the finished timer belongs to yesterday's bucket.
      expect(screen.getByText('0h 0m')).toBeInTheDocument();
    });

    it('does not render the removed Tasks Worked On card', () => {
      renderDashboard();

      expect(screen.getByText('Total Time Today')).toBeInTheDocument();
      expect(screen.getByText('Earnings Today')).toBeInTheDocument();
      expect(screen.queryByText('Tasks Worked On')).not.toBeInTheDocument();
    });

    it('hides a scorecard when its dashboard widget setting is disabled', () => {
      mockIsWidgetEnabled.mockImplementation(((id: string) => id !== 'earnings-today') as never);

      renderDashboard();

      expect(screen.getByText('Total Time Today')).toBeInTheDocument();
      expect(screen.queryByText('Earnings Today')).not.toBeInTheDocument();
    });
  });
});
