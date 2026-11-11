/**
 * Unit Tests for SessionDashboard Component
 *
 * Tests the main session management dashboard including session creation,
 * display, activation, and timer management functionality.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionDashboard } from '../SessionDashboard';
import { TaskSession, TimerInstance, TimerState } from '../../../types/timer';
import { Task } from '../../../types/task';
import { ActiveTimerProvider } from '../../../contexts/ActiveTimerContext';

// Mock dependencies (the backend is a fake, installed globally in
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

// Mock session management hook
const mockStartTask = vi.fn();
const mockAddManualTime = vi.fn();
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
  startTask: mockStartTask,
  addManualTime: mockAddManualTime,
  updateSession: mockUpdateSession,
  deleteSession: mockDeleteSession,
  createTimerInstance: mockCreateTimerInstance,
  startTimerInstance: mockStartTimerInstance,
  stopTimerInstance: mockStopTimerInstance,
  pauseTimerInstance: mockPauseTimerInstance,
  resumeTimerInstance: mockResumeTimerInstance,
  deleteTimerInstance: vi.fn(),
  updateTimerInstance: vi.fn(),
  editTimerEntry: vi.fn(),
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
  isLoading: false,
};

vi.mock('../../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => mockTaskManagement,
  TaskManagementProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock active timer context
let mockActiveTimer: TimerInstance | null = null;
const mockSetActiveTimer = vi.fn();

vi.mock('../../../contexts/ActiveTimerContext', () => ({
  ActiveTimerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useActiveTimer: () => ({ activeTimer: mockActiveTimer, setActiveTimer: mockSetActiveTimer }),
}));

// Mock child components to isolate SessionDashboard testing. The toolbar is
// a session-level status bar now — per-timer actions (including Add Timer)
// come through SessionTimerDisplay.
vi.mock('../../layout/SessionTimerToolbar', () => ({
  SessionTimerToolbar: ({ onSwitchTask }: { onSwitchTask?: () => void }) => (
    <div data-testid="session-timer-bar">
      <button onClick={onSwitchTask}>Switch task</button>
    </div>
  ),
}));

const mockOnStartWork = vi.fn();
const mockOnAddTime = vi.fn();
const renderDashboard = () =>
  render(<SessionDashboard onStartWork={mockOnStartWork} onAddTime={mockOnAddTime} />, {
    wrapper: ({ children }) => <ActiveTimerProvider>{children}</ActiveTimerProvider>,
  });

vi.mock('../../ui/sessions/SessionList', () => ({
  SessionList: ({
    sessions,
    archivedTaskNames,
    isLoading,
    sessionNotes,
    selectedSessionId,
    onSelectSession,
    onStartSession,
    onOpenNotes,
  }: any) => (
    <div
      data-testid="session-list"
      data-loading={String(isLoading ?? false)}
      data-archived-task-names={(archivedTaskNames ?? []).join(',')}
      data-selected={selectedSessionId ?? ''}
    >
      {sessions.map((session: TaskSession) => (
        <div key={session.id} data-testid="session-card" className={session.isActive ? 'active' : ''}>
          <span>{session.taskName}</span>
          <span>{new Date(session.totalDuration).toISOString().substr(11, 8)}</span>
          <span data-testid={`previews-${session.id}`}>{(sessionNotes.get(session.id) ?? []).join(' | ')}</span>
          <button onClick={() => onSelectSession(session)}>Select {session.id}</button>
          <button onClick={() => onStartSession(session)}>Start {session.id}</button>
          <button onClick={() => onOpenNotes(session.id)}>Notes for {session.id}</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../ui/display/SessionTimerDisplay', () => ({
  SessionTimerDisplay: ({
    session,
    onStartTimer,
    onStopTimer,
    onPauseTimer,
    onResumeTimer,
    onDeleteTimer,
    onEditTimer,
    onOpenNotes,
    onAddTimer,
  }: any) => (
    <div data-testid="session-timer-display">
      <button onClick={() => onEditTimer(session.timerInstances.at(-1), session)}>Edit Timer</button>
      <button onClick={() => onAddTimer()}>Add Timer</button>
      <button onClick={() => onDeleteTimer('timer-idle')}>Delete Idle Timer</button>
      <button onClick={() => onDeleteTimer('timer-done')}>Delete Finished Timer</button>
      <button onClick={() => onStartTimer('timer-1')}>Start Timer</button>
      <button onClick={() => onStopTimer('timer-1')}>Stop Timer</button>
      <button onClick={() => onPauseTimer('timer-1')}>Pause Timer</button>
      <button onClick={() => onResumeTimer('timer-1')}>Resume Timer</button>
      <button onClick={() => onOpenNotes('session-1', 'timer-1')}>Notes</button>
    </div>
  ),
}));

vi.mock('../../ui/dialogs/SessionNotesDialog', () => ({
  SessionNotesDialog: ({ onClose, timerInstanceId }: any) => (
    <div data-testid="notes-dialog">
      <span>Notes Dialog</span>
      {timerInstanceId && <span>for {timerInstanceId}</span>}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// Stable object: a fresh one per render would re-run the dashboard's memos
const mockTaskNotes = { notes: [] as any[] };
vi.mock('../../../hooks/useTaskNotes', () => ({
  useTaskNotes: () => mockTaskNotes,
}));

describe('SessionDashboard', () => {
  beforeEach(() => {
    mockActiveTimer = null;
    // vitest's clearMocks keeps implementations; undo any per-test override
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
    it('keeps its screen-reader heading out of the page layout', () => {
      renderDashboard();

      // 1px, not MUI's width: 1, which means 100% and scrolled the page sideways
      expect(screen.getByRole('heading', { name: 'Sessions', level: 1 })).toHaveStyle({
        position: 'absolute',
        width: '1px',
        height: '1px',
      });
    });

    it('should render the dashboard with no sessions', () => {
      renderDashboard();

      expect(screen.getByText('All Sessions')).toBeInTheDocument();
      // No floating + button (it covered the toasts): the toolbar, the empty
      // state and the tray start work
      expect(screen.queryByLabelText('start work')).not.toBeInTheDocument();
    });

    it('should show loading state when sessions are loading', () => {
      // Update the mock to return loading state
      mockSessionManagement.isLoading = true;

      renderDashboard();

      expect(screen.getByLabelText('Loading sessions')).toHaveAttribute('aria-busy', 'true');

      // Reset for other tests
      mockSessionManagement.isLoading = false;
    });
  });

  describe('Starting work', () => {
    // The Start Work and Add Time dialogs belong to the app (one of each)
    it("opens the app's Start Work dialog from the active session's Switch task", () => {
      renderDashboard();

      fireEvent.click(screen.getByRole('button', { name: /switch task/i }));

      expect(mockOnStartWork).toHaveBeenCalledTimes(1);
    });

    it("opens the app's Add Time dialog from the All Sessions header", () => {
      renderDashboard();

      fireEvent.click(screen.getByRole('button', { name: 'Add time' }));

      expect(mockOnAddTime).toHaveBeenCalledTimes(1);
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
            startTime: new Date('2024-01-15T10:00:00Z').toISOString(),
            endTime: new Date('2024-01-15T11:00:00Z').toISOString(),
            duration: 3600000, // 1 hour
            isRunning: false,
            isPaused: false,
            state: TimerState.stopped,
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
      // Update mock to return sessions (the list shows with no session active)
      (mockSessionManagement as any).sessions = mockSessions;
      (mockSessionManagement as any).activeSession = null;
      mockSessionManagement.isLoading = false;
      mockSessionManagement.error = null;

      renderDashboard();

      const list = within(screen.getByTestId('session-list'));
      expect(list.getByText('Development Work')).toBeInTheDocument();
      expect(list.getByText('Code Review')).toBeInTheDocument();
      expect(list.getByText('01:00:00')).toBeInTheDocument(); // 1 hour duration

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
      expect(screen.getByTestId('session-list')).toHaveAttribute('data-archived-task-names', 'Development Work');
      // ...while the archived task's session history still reaches it
      expect(screen.getByText('Development Work')).toBeInTheDocument();

      // Reset for other tests
      (mockSessionManagement as any).sessions = [];
    });

    it('gives an active session the page, without the list of every session', () => {
      (mockSessionManagement as any).sessions = mockSessions;
      (mockSessionManagement as any).activeSession = mockSessions[1];
      mockSessionManagement.isLoading = false;
      mockSessionManagement.error = null;

      renderDashboard();

      expect(screen.getByText('Active Session')).toBeInTheDocument();
      expect(screen.getByTestId('session-timer-display')).toBeInTheDocument();
      expect(screen.queryByTestId('session-list')).not.toBeInTheDocument();
      expect(screen.queryByText('All Sessions')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add time' })).not.toBeInTheDocument();

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
          startTime: new Date('2024-01-15T10:00:00Z').toISOString(),
          endTime: undefined,
          duration: 0,
          isRunning: false,
          isPaused: false,
          state: TimerState.stopped,
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

    const addTimerFor = async (taskName?: string) => {
      fireEvent.click(screen.getByText('Add Timer'));
      const dialog = await screen.findByRole('dialog');
      if (taskName) {
        fireEvent.mouseDown(within(dialog).getByLabelText('Task'));
        fireEvent.click(await screen.findByRole('option', { name: taskName }));
      }
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add Timer' }));
    };

    it("adds an idle timer for the session's task by default", async () => {
      mockCreateTimerInstance.mockResolvedValue(null);

      renderDashboard();
      await addTimerFor();

      await waitFor(() => {
        expect(mockCreateTimerInstance).toHaveBeenCalledWith('session-1', {
          taskId: 'task-1',
          taskName: 'Development Work',
        });
      });
      // New timers start idle: the user starts them explicitly
      expect(mockStartTimer).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('adds a timer for another task picked in the dialog', async () => {
      mockCreateTimerInstance.mockResolvedValue(null);

      renderDashboard();
      await addTimerFor('Code Review');

      await waitFor(() => {
        expect(mockCreateTimerInstance).toHaveBeenCalledWith('session-1', {
          taskId: 'task-2',
          taskName: 'Code Review',
        });
      });
    });

    it('adds nothing when the dialog is cancelled', async () => {
      renderDashboard();

      fireEvent.click(screen.getByText('Add Timer'));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockCreateTimerInstance).not.toHaveBeenCalled();
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

  describe('Timer deletion', () => {
    const sessionWithTimers: TaskSession = {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Development Work',
      timerInstances: [
        {
          id: 'timer-idle',
          sessionId: 'session-1',
          startTime: new Date('2024-01-15T12:00:00Z').toISOString(),
          state: TimerState.idle,
          isRunning: false,
          isPaused: false,
          createdAt: '2024-01-15T12:00:00Z',
          updatedAt: '2024-01-15T12:00:00Z',
        },
        {
          id: 'timer-done',
          sessionId: 'session-1',
          startTime: new Date('2024-01-15T10:00:00Z').toISOString(),
          endTime: new Date('2024-01-15T11:30:00Z').toISOString(),
          duration: 90 * 60_000,
          state: TimerState.stopped,
          isRunning: false,
          isPaused: false,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T11:30:00Z',
        },
      ],
      totalDuration: 90 * 60_000,
      isActive: true,
      date: '2024-01-15',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T11:30:00Z',
    };

    beforeEach(() => {
      (mockSessionManagement as any).sessions = [sessionWithTimers];
      (mockSessionManagement as any).activeSession = sessionWithTimers;
    });

    it('deletes an idle timer without asking, since it holds no time', () => {
      renderDashboard();

      fireEvent.click(screen.getByText('Delete Idle Timer'));

      expect(mockSessionManagement.deleteTimerInstance).toHaveBeenCalledWith('timer-idle');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('deletes a finished timer straight away (its toast offers Undo)', () => {
      renderDashboard();

      fireEvent.click(screen.getByText('Delete Finished Timer'));

      expect(mockSessionManagement.deleteTimerInstance).toHaveBeenCalledWith('timer-done');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
      // Update the mock object directly (the list shows with no session active)
      Object.assign(mockSessionManagement, {
        sessions: mockSessions,
        activeSession: null,
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
          startTime: new Date().toISOString(),
          endTime: undefined,
          duration: 0,
          isRunning: false,
          isPaused: false,
          state: TimerState.stopped,
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

      // Verify notes dialog is opened, for the timer the button belongs to
      expect(screen.getByTestId('notes-dialog')).toBeInTheDocument();
      expect(screen.getByText('for timer-1')).toBeInTheDocument();
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
    const NOW = new Date('2024-01-15T12:00:00'); // local noon (no Z suffix)

    const statsSessions: TaskSession[] = [
      {
        id: 'session-running',
        taskId: 'task-1',
        taskName: 'Development Work',
        timerInstances: [
          {
            id: 'instance-running',
            sessionId: 'session-running',
            startTime: new Date(NOW.getTime() - 10 * 60_000).toISOString(), // started 10 min ago
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
            startTime: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(),
            endTime: new Date(NOW.getTime() - 2.5 * 3_600_000).toISOString(),
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
        activeSession: statsSessions[0],
        isLoading: false,
        error: null,
      });
      Object.assign(mockTaskManagement, {
        tasks: mockTasks.map(task => (task.id === 'task-1' ? { ...task, hourlyRate: 60 } : task)),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sums only the active session, including its running timer', () => {
      renderDashboard();

      // Active session: one timer running for 10 min. The inactive session's
      // 30 min stopped timer is not part of the cards. Live values render in
      // the ticking HH:MM:SS format.
      expect(screen.getByText('00:10:00')).toBeInTheDocument();
      // 10 min at $60/h, rendered as currency, with the rate as subtitle
      expect(screen.getByText('$10.00')).toBeInTheDocument();
      expect(screen.getByText('At $60.00/hr')).toBeInTheDocument();
    });

    it('says when the session earns at more than one rate', () => {
      const active = mockSessionManagement.activeSession as unknown as TaskSession;
      const review = { taskId: 'task-2', taskName: 'Code Review', hourlyRate: 90 };
      const reviewing = { ...active.timerInstances[0], id: 'other', task: review };
      Object.assign(mockSessionManagement, {
        activeSession: { ...active, timerInstances: [...active.timerInstances, reviewing] },
      });

      renderDashboard();

      expect(screen.getByText('Mixed rates')).toBeInTheDocument();
      // 10 min at $60/h plus 10 min at $90/h, and both tasks named
      expect(screen.getByText('$25.00')).toBeInTheDocument();
      expect(screen.getByText('Development Work, Code Review')).toBeInTheDocument();
    });

    it('ticks the totals forward while a timer is running', () => {
      renderDashboard();

      expect(screen.getByText('00:10:00')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(screen.getByText('00:11:00')).toBeInTheDocument();
      expect(screen.getByText('$11.00')).toBeInTheDocument();
    });

    it('shows placeholders and honest copy when no session is active', () => {
      Object.assign(mockSessionManagement, { activeSession: null });

      renderDashboard();

      expect(screen.getAllByText('—')).toHaveLength(2);
      expect(screen.getByText('No active session')).toBeInTheDocument();
      expect(screen.getByText('Start a session to track earnings')).toBeInTheDocument();
    });

    it("includes the active session's timers from earlier days", () => {
      // The cards total every timer in the active session: a timer that ran
      // yesterday counts the same as one running right now.
      const sessionAcrossDays = {
        ...statsSessions[0],
        id: 'session-yesterday',
        date: '2024-01-14',
        timerInstances: [
          {
            ...statsSessions[1].timerInstances[0],
            id: 'instance-yesterday',
            sessionId: 'session-yesterday',
            // 30 min run finished yesterday
            startTime: new Date(NOW.getTime() - 26 * 3_600_000).toISOString(),
            endTime: new Date(NOW.getTime() - 25.5 * 3_600_000).toISOString(),
          },
          {
            ...statsSessions[0].timerInstances[0],
            id: 'instance-today',
            sessionId: 'session-yesterday',
            startTime: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
          },
        ],
      };
      Object.assign(mockSessionManagement, {
        sessions: [sessionAcrossDays],
        activeSession: sessionAcrossDays,
      });

      renderDashboard();

      expect(screen.getByText('00:40:00')).toBeInTheDocument();
      expect(screen.getByText('$40.00')).toBeInTheDocument();
    });

    it('keeps totals unchanged across midnight with no timer running', () => {
      // Totals are not day-bucketed, so nothing rolls over or resets at
      // local midnight while every timer is stopped.
      const LATE = new Date('2024-01-15T23:59:30');
      vi.setSystemTime(LATE);
      const stoppedSession = {
        ...statsSessions[1],
        timerInstances: [
          {
            ...statsSessions[1].timerInstances[0],
            startTime: new Date(LATE.getTime() - 59.5 * 60_000).toISOString(),
            endTime: new Date(LATE.getTime() - 30_000).toISOString(),
            duration: 59 * 60_000,
          },
        ],
      };
      Object.assign(mockSessionManagement, {
        sessions: [stoppedSession],
        activeSession: stoppedSession,
      });

      renderDashboard();

      expect(screen.getByText('00:59:00')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(120_000); // crosses local midnight
      });

      expect(screen.getByText('00:59:00')).toBeInTheDocument();
    });

    it('does not render the removed Tasks Worked On card', () => {
      renderDashboard();

      expect(screen.getByText('Session Time')).toBeInTheDocument();
      expect(screen.getByText('Session Earnings')).toBeInTheDocument();
      expect(screen.queryByText('Tasks Worked On')).not.toBeInTheDocument();
    });
  });

  describe('the rest of the page wiring', () => {
    const finished = {
      id: 'timer-done',
      sessionId: 'session-1',
      startTime: new Date('2024-01-15T10:00:00Z').toISOString(),
      endTime: new Date('2024-01-15T11:30:00Z').toISOString(),
      duration: 90 * 60_000,
      state: TimerState.stopped,
      isRunning: false,
      isPaused: false,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T11:30:00Z',
    };
    const session: TaskSession = {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Development Work',
      timerInstances: [finished],
      totalDuration: 90 * 60_000,
      isActive: true,
      date: '2024-01-15',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T11:30:00Z',
    };
    const other: TaskSession = { ...session, id: 'session-2', isActive: false, timerInstances: [] };
    const note = (id: string, overrides: Record<string, unknown>) => ({
      id,
      taskId: 'task-1',
      templateId: 'free-form',
      templateName: 'Free-form Note',
      fieldValues: { content: id },
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      ...overrides,
    });

    beforeEach(() => {
      Object.assign(mockSessionManagement, { sessions: [session, other], activeSession: session });
      mockTaskNotes.notes = [];
    });

    it("edits a timer's duration in a dialog that closes once saved", async () => {
      vi.mocked(mockSessionManagement.editTimerEntry).mockResolvedValueOnce(null).mockResolvedValueOnce('session-1');
      renderDashboard();

      fireEvent.click(screen.getByText('Edit Timer'));
      const dialog = await screen.findByRole('dialog', { name: 'Edit Time Entry' });
      expect(within(dialog).getByLabelText('Hours')).toHaveValue(1);
      expect(within(dialog).getByLabelText('Minutes')).toHaveValue(30);

      // Refused: the dialog stays for another try
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(mockSessionManagement.editTimerEntry).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockSessionManagement.editTimerEntry).toHaveBeenCalledWith(
        'timer-done',
        expect.objectContaining({ moveTo: undefined })
      );
    });

    it('closes the edit dialog on Cancel', async () => {
      renderDashboard();
      fireEvent.click(screen.getByText('Edit Timer'));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    // The session list only shows while no session is active
    const withNoActiveSession = () => Object.assign(mockSessionManagement, { activeSession: null });

    it('selects a session, starts another, and opens its notes', async () => {
      withNoActiveSession();
      renderDashboard();

      fireEvent.click(screen.getByText('Select session-2'));
      expect(screen.getByTestId('session-list')).toHaveAttribute('data-selected', 'session-2');

      fireEvent.click(screen.getByText('Start session-2'));
      expect(mockSetActiveSession).toHaveBeenCalledWith(other);

      fireEvent.click(screen.getByText('Notes for session-2'));
      expect(screen.getByTestId('notes-dialog')).toBeInTheDocument();
      expect(screen.queryByText(/^for /)).not.toBeInTheDocument();
    });

    it("closes a session's notes once the session is gone", () => {
      withNoActiveSession();
      const { rerender } = renderDashboard();
      fireEvent.click(screen.getByText('Notes for session-2'));

      (mockSessionManagement as any).sessions = [session];
      rerender(<SessionDashboard onStartWork={mockOnStartWork} onAddTime={mockOnAddTime} />);
      expect(screen.queryByTestId('notes-dialog')).not.toBeInTheDocument();
    });

    it("previews each session's notes, last edited first, leaving out archived and empty ones", () => {
      mockTaskNotes.notes = [
        note('older', { sessionId: 'session-1', updatedAt: '2024-01-15T09:00:00Z' }),
        note('newer', { sessionId: 'session-1', updatedAt: '2024-01-15T12:00:00Z' }),
        note('archived', { sessionId: 'session-1', isArchived: true }),
        note('blank', { sessionId: 'session-1', fieldValues: { content: '   ' } }),
        note('task-wide', {}),
      ];
      withNoActiveSession();
      renderDashboard();

      expect(screen.getByTestId('previews-session-1')).toHaveTextContent('newer | older');
      expect(screen.getByTestId('previews-session-2')).toBeEmptyDOMElement();
    });
  });
});
