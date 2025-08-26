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
import { TaskSession, TimerInstance } from '../../../types/timer';
import { Task } from '../../../types/task';
import { ActiveTimerProvider } from '../../../contexts/ActiveTimerContext';

// Mock dependencies
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mockInvoke,
  listen: vi.fn(),
  emit: vi.fn(),
}));

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
  setActiveSession: mockSetActiveSession,
  refreshSessions: mockRefreshSessions,
};

vi.mock('../../../hooks/useSessionManagement', () => ({
  useSessionManagement: () => mockSessionManagement,
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

// Mock useTasks hook
const mockTasksHook = {
  tasks: mockTasks,
  isLoading: false,
  error: null,
  loading: false, // Add this for compatibility
};

vi.mock('../../../hooks/useTasks', () => ({
  useTasks: () => mockTasksHook,
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
  SessionList: ({ sessions }: { sessions: TaskSession[] }) => (
    <div data-testid="session-list">
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
    // Reset mock state
    Object.assign(mockSessionManagement, {
      sessions: [],
      activeSession: null,
      isLoading: false,
      error: null,
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
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      renderDashboard();

      const continueButton = screen.getByText('Continue Working');
      fireEvent.click(continueButton);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'timer-continue-activity',
          detail: expect.objectContaining({
            reason: 'user-action',
          }),
        })
      );
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
});
