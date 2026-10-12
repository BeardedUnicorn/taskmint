/**
 * Unit Tests for SessionTimerToolbar Component
 *
 * Tests the session status bar: the start-session form, the active-session
 * header row, and session-level actions. Per-timer controls live in
 * SessionTimerDisplay and are tested there.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    startOptions: mockTasks,
    onStartTask: vi.fn().mockResolvedValue(null),
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
    const picker = () => screen.getByPlaceholderText('Choose a task…');

    it('should render the start form when no session is active', () => {
      render(<SessionTimerToolbar {...mockProps} />);

      expect(screen.getByText('Start Work')).toBeInTheDocument();
      expect(picker()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    });

    it('starts the chosen task in one step', () => {
      render(<SessionTimerToolbar {...mockProps} />);

      fireEvent.change(picker(), { target: { value: 'Dev' } });
      fireEvent.click(screen.getByRole('option', { name: 'Development Work' }));
      const startButton = screen.getByRole('button', { name: 'Start' });
      expect(startButton).not.toBeDisabled();
      fireEvent.click(startButton);

      expect(mockProps.onStartTask).toHaveBeenCalledWith('task-1', 'Development Work');
    });

    it('does not start from a typed name that is not a task', async () => {
      const user = userEvent.setup();
      render(<SessionTimerToolbar {...mockProps} />);

      await user.type(picker(), 'Custom Task Name{Enter}');

      expect(screen.getByText('No options')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
      expect(mockProps.onStartTask).not.toHaveBeenCalled();
    });

    it('lists tasks in the order given, starring favorites', () => {
      const favorite: Task = { ...mockTasks[1], isFavorite: true };
      render(<SessionTimerToolbar {...mockProps} startOptions={[favorite, mockTasks[0]]} />);

      fireEvent.mouseDown(picker());
      const options = screen.getAllByRole('option').map(option => option.textContent);
      expect(options).toEqual(['★ Code Review', 'Development Work']);
    });

    it('points to the Tasks page when there are no tasks to start', () => {
      render(<SessionTimerToolbar {...mockProps} startOptions={[]} />);

      const input = screen.getByPlaceholderText('Add a task on the Tasks page to start');
      expect(input).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
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
