/**
 * Unit Tests for SessionTimerToolbar Component
 * 
 * Tests the session timer bar component including timer controls,
 * session management, and timer instance operations.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SessionTimerToolbar } from '../SessionTimerToolbar';
import { TaskSession, TimerInstance } from '../../../types/timer';
import { Task } from '../../../types/task';
import { SESSION_CONSTANTS } from '../../../constants';

// Mock dependencies
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock('../../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
}));

describe('SessionTimerToolbar', () => {
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

  const mockTimerInstance: TimerInstance = {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: undefined,
    duration: 0,
    isRunning: true,
    isPaused: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockActiveSession: TaskSession = {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Development Work',
    timerInstances: [mockTimerInstance],
    totalDuration: 3600000, // 1 hour
    isActive: true,
    date: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockProps = {
    activeSession: null as TaskSession | null,
    predefinedTasks: mockTasks,
    onStartSession: vi.fn(),
    onEndSession: vi.fn(),
    onPauseAll: vi.fn(),
    onResumeAll: vi.fn(),
    onCreateTimerInstance: vi.fn(),
    onStartTimer: vi.fn(),
    onStopTimer: vi.fn(),
    onPauseTimer: vi.fn(),
    onResumeTimer: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('No Active Session State', () => {
    it('should render start session controls when no active session', () => {
      render(<SessionTimerToolbar {...mockProps} />);
      
      expect(screen.getByText('Start New Session')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Select or enter task name...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    });

    it('should disable start button when no task is selected', () => {
      render(<SessionTimerToolbar {...mockProps} />);
      
      const startButton = screen.getByRole('button', { name: /start session/i });
      expect(startButton).toBeDisabled();
    });

    it('should enable start button when task is selected', () => {
      render(<SessionTimerToolbar {...mockProps} />);
      
      const taskInput = screen.getByPlaceholderText('Select or enter task name...');
      fireEvent.change(taskInput, { target: { value: 'Development Work' } });
      
      const startButton = screen.getByRole('button', { name: /start session/i });
      expect(startButton).not.toBeDisabled();
    });

    it('should call onStartSession when start button is clicked with selected task', () => {
      render(<SessionTimerToolbar {...mockProps} />);
      
      const taskInput = screen.getByPlaceholderText('Select or enter task name...');
      fireEvent.change(taskInput, { target: { value: 'Development Work' } });
      
      const startButton = screen.getByRole('button', { name: /start session/i });
      fireEvent.click(startButton);
      
      expect(mockProps.onStartSession).toHaveBeenCalledWith('task-1', 'Development Work');
    });

    it('should handle custom task name input', () => {
      render(<SessionTimerToolbar {...mockProps} />);
      
      const taskInput = screen.getByPlaceholderText('Select or enter task name...');
      fireEvent.change(taskInput, { target: { value: 'Custom Task Name' } });
      
      const startButton = screen.getByRole('button', { name: /start session/i });
      fireEvent.click(startButton);
      
      expect(mockProps.onStartSession).toHaveBeenCalledWith('', 'Custom Task Name');
    });
  });

  describe('Active Session State', () => {
    const propsWithActiveSession = {
      ...mockProps,
      activeSession: mockActiveSession,
    };

    it('should render active session information', () => {
      render(<SessionTimerToolbar {...propsWithActiveSession} />);
      
      expect(screen.getByText('Development Work')).toBeInTheDocument();
      expect(screen.getByText('1 timer')).toBeInTheDocument();
      // The component shows individual timer elapsed times, not total duration in the header
    });

    it('should show End Session button when session is active', () => {
      render(<SessionTimerToolbar {...propsWithActiveSession} />);
      
      expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument();
    });

    it('should call onEndSession when End Session button is clicked', () => {
      render(<SessionTimerToolbar {...propsWithActiveSession} />);
      
      const endButton = screen.getByRole('button', { name: /end session/i });
      fireEvent.click(endButton);
      
      expect(mockProps.onEndSession).toHaveBeenCalled();
    });

    it('should show Add Timer button when session is active', () => {
      render(<SessionTimerToolbar {...propsWithActiveSession} />);
      
      expect(screen.getByRole('button', { name: /add timer/i })).toBeInTheDocument();
    });

    it('should call onCreateTimerInstance when Add Timer button is clicked', () => {
      render(<SessionTimerToolbar {...propsWithActiveSession} />);

      const addTimerButton = screen.getByRole('button', { name: /add timer/i });
      fireEvent.click(addTimerButton);

      expect(mockProps.onCreateTimerInstance).toHaveBeenCalledWith('session-1');
    });

    it('should disable Add Timer button when maximum instances reached', () => {
      const maxedOutSession: TaskSession = {
        ...mockActiveSession,
        timerInstances: Array.from({ length: SESSION_CONSTANTS.MAX_TIMER_INSTANCES_PER_SESSION }, (_, i) => ({
          ...mockTimerInstance,
          id: `instance-${i}`,
        })),
      };

      render(
        <SessionTimerToolbar {...mockProps} activeSession={maxedOutSession} />
      );

      const addTimerButton = screen.getByRole('button', { name: /add timer/i });
      expect(addTimerButton).toBeDisabled();
    });

    it('should show error notification if adding timer fails', async () => {
      mockProps.onCreateTimerInstance.mockRejectedValueOnce(
        new Error('Add failed')
      );

      render(<SessionTimerToolbar {...propsWithActiveSession} />);

      const addTimerButton = screen.getByRole('button', { name: /add timer/i });
      fireEvent.click(addTimerButton);

      await waitFor(() => {
        expect(mockProps.onCreateTimerInstance).toHaveBeenCalledWith('session-1');
        expect(mockShowError).toHaveBeenCalledWith('Add failed');
      });
    });
  });

  describe('Timer Instance Controls', () => {
    const runningSession = {
      ...mockActiveSession,
      timerInstances: [
        {
          ...mockTimerInstance,
          isRunning: true,
          isPaused: false,
        },
      ],
    };

    const pausedSession = {
      ...mockActiveSession,
      timerInstances: [
        {
          ...mockTimerInstance,
          isRunning: false,
          isPaused: true,
        },
      ],
    };

    const stoppedSession = {
      ...mockActiveSession,
      timerInstances: [
        {
          ...mockTimerInstance,
          isRunning: false,
          isPaused: false,
          endTime: new Date('2024-01-15T11:00:00Z'),
        },
      ],
    };

    it('should show pause button for running timer', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={runningSession} />);
      
      expect(screen.getByRole('button', { name: /pause timer 1/i })).toBeInTheDocument();
    });

    it('should show resume button for paused timer', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={pausedSession} />);
      
      expect(screen.getByRole('button', { name: /resume timer 1/i })).toBeInTheDocument();
    });

    it('should show start button for stopped timer', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={stoppedSession} />);
      
      expect(screen.getByRole('button', { name: /start timer 1/i })).toBeInTheDocument();
    });

    it('should call onPauseTimer when pause button is clicked', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={runningSession} />);
      
      const pauseButton = screen.getByRole('button', { name: /pause timer 1/i });
      fireEvent.click(pauseButton);
      
      expect(mockProps.onPauseTimer).toHaveBeenCalledWith('instance-1');
    });

    it('should call onResumeTimer when resume button is clicked', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={pausedSession} />);
      
      const resumeButton = screen.getByRole('button', { name: /resume timer 1/i });
      fireEvent.click(resumeButton);
      
      expect(mockProps.onResumeTimer).toHaveBeenCalledWith('instance-1');
    });

    it('should call onStartTimer when start button is clicked', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={stoppedSession} />);
      
      const startButton = screen.getByRole('button', { name: /start timer 1/i });
      fireEvent.click(startButton);
      
      expect(mockProps.onStartTimer).toHaveBeenCalledWith('instance-1');
    });

    it('should call onStopTimer when stop button is clicked', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={runningSession} />);
      
      const stopButton = screen.getByRole('button', { name: /stop timer 1/i });
      fireEvent.click(stopButton);
      
      expect(mockProps.onStopTimer).toHaveBeenCalledWith('instance-1');
    });
  });

  describe('Multiple Timer Instances', () => {
    const multiTimerSession = {
      ...mockActiveSession,
      timerInstances: [
        { ...mockTimerInstance, id: 'instance-1', isRunning: true },
        { ...mockTimerInstance, id: 'instance-2', isRunning: false, isPaused: true },
        { ...mockTimerInstance, id: 'instance-3', isRunning: false, isPaused: false },
      ],
    };

    it('should display correct timer count for multiple timers', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={multiTimerSession} />);
      
      expect(screen.getByText('3 timers')).toBeInTheDocument();
    });

    it('should show controls for each timer instance', () => {
      render(<SessionTimerToolbar {...mockProps} activeSession={multiTimerSession} />);
      
      // Should have controls for each timer instance plus session-level controls
      // Timer 1: pause + stop (running)
      // Timer 2: resume + stop (paused) 
      // Timer 3: start (stopped)
      // Plus: Pause All, Resume All, End Session, Add Timer, More menu
      const allButtons = screen.getAllByRole('button');
      expect(allButtons.length).toBeGreaterThanOrEqual(7); // At least 7 buttons total
    });
  });

  describe('Error Handling', () => {
    it('should handle missing task gracefully', () => {
      const sessionWithMissingTask = {
        ...mockActiveSession,
        taskName: 'Non-existent Task',
        taskId: 'non-existent',
      };

      render(<SessionTimerToolbar {...mockProps} activeSession={sessionWithMissingTask} />);
      
      expect(screen.getByText('Non-existent Task')).toBeInTheDocument();
    });

    it('should handle empty timer instances array', () => {
      const sessionWithNoTimers = {
        ...mockActiveSession,
        timerInstances: [],
      };

      render(<SessionTimerToolbar {...mockProps} activeSession={sessionWithNoTimers} />);
      
      expect(screen.getByText('0 timers')).toBeInTheDocument();
    });
  });
});
