/**
 * Unit Tests for SessionTimerToolbar Component
 *
 * Tests the session status bar: the start-session form, the active-session
 * header row, and session-level actions. Per-timer controls live in
 * SessionTimerDisplay and are tested there.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SessionTimerToolbar } from '../SessionTimerToolbar';
import { TaskSession, TimerInstance, TimerState } from '../../../types/timer';
import { Task } from '../../../types/task';

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
    state: TimerState.running,
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
    onOpenSessionNotes: vi.fn(),
  };

  const sessionWith = (overrides: Partial<TimerInstance>): TaskSession => ({
    ...mockActiveSession,
    timerInstances: [{ ...mockTimerInstance, ...overrides }],
  });

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

    it('should show Pause All for a running timer and call onPauseAll', () => {
      render(
        <SessionTimerToolbar {...mockProps} activeSession={sessionWith({ state: TimerState.running })} />
      );

      const pauseAllButton = screen.getByRole('button', { name: /pause all/i });
      expect(screen.queryByRole('button', { name: /resume all/i })).not.toBeInTheDocument();

      fireEvent.click(pauseAllButton);
      expect(mockProps.onPauseAll).toHaveBeenCalled();
    });

    it('should show Resume All for a paused timer and call onResumeAll', () => {
      render(
        <SessionTimerToolbar
          {...mockProps}
          activeSession={sessionWith({ state: TimerState.paused, isRunning: false, isPaused: true })}
        />
      );

      const resumeAllButton = screen.getByRole('button', { name: /resume all/i });
      expect(screen.queryByRole('button', { name: /pause all/i })).not.toBeInTheDocument();

      fireEvent.click(resumeAllButton);
      expect(mockProps.onResumeAll).toHaveBeenCalled();
    });

    it('should open the options menu and fire onOpenSessionNotes', () => {
      render(<SessionTimerToolbar {...propsWithActiveSession} />);

      fireEvent.click(screen.getByRole('button', { name: /session options/i }));
      fireEvent.click(screen.getByText('Session Notes'));

      expect(mockProps.onOpenSessionNotes).toHaveBeenCalledWith('session-1');
    });

    it('should not render per-timer controls — those live in the session panel', () => {
      render(<SessionTimerToolbar {...propsWithActiveSession} />);

      expect(screen.queryByRole('button', { name: /pause timer/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add timer/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
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
