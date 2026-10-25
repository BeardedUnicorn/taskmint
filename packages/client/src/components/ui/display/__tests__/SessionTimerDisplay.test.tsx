/**
 * Unit Tests for SessionTimerDisplay Component
 *
 * The session detail panel: live session total, per-timer rows with
 * state-appropriate controls, Add Timer affordance, and the zero-timer
 * empty state.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SessionTimerDisplay } from '../SessionTimerDisplay';
import { TaskSession, TimerInstance, TimerState } from '../../../../types/timer';
import { SESSION_CONSTANTS } from '../../../../constants';

describe('SessionTimerDisplay', () => {
  const START = new Date('2024-01-15T10:00:00Z');
  const NOW_MS = new Date('2024-01-15T11:00:00Z').getTime(); // 1h after start

  const baseInstance: TimerInstance = {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: START,
    endTime: undefined,
    duration: 0,
    state: TimerState.running,
    isRunning: true,
    isPaused: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const stoppedInstance: TimerInstance = {
    ...baseInstance,
    id: 'instance-2',
    state: TimerState.stopped,
    isRunning: false,
    endTime: new Date('2024-01-15T10:30:00Z'),
    duration: 30 * 60_000, // 30 minutes
  };

  const mockSession: TaskSession = {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Development Work',
    timerInstances: [baseInstance, stoppedInstance],
    totalDuration: 0,
    isActive: true,
    date: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockProps = {
    session: mockSession,
    nowMs: NOW_MS,
    showControls: true,
    showNotes: true,
    size: 'large' as const,
    onStartTimer: vi.fn(),
    onStopTimer: vi.fn(),
    onPauseTimer: vi.fn(),
    onResumeTimer: vi.fn(),
    onDeleteTimer: vi.fn(),
    onEditTimer: vi.fn(),
    onOpenNotes: vi.fn(),
    onAddTimer: vi.fn(),
  };

  const sessionWith = (overrides: Partial<TimerInstance>): TaskSession => ({
    ...mockSession,
    timerInstances: [{ ...baseInstance, ...overrides }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header', () => {
    it('renders the task name, timer count, and status chips', () => {
      render(<SessionTimerDisplay {...mockProps} />);

      expect(screen.getByText('Development Work')).toBeInTheDocument();
      expect(screen.getByText('2 timers')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      // Header chip plus the running row's chip
      expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
    });

    it('shows the live session total derived from the shared clock', () => {
      render(<SessionTimerDisplay {...mockProps} />);

      // 1h running + 30m stored = 1h 30m
      expect(screen.getByLabelText('Session total time')).toHaveTextContent('01:30:00');
    });

    it('advances the total when the shared clock advances', () => {
      const { rerender } = render(<SessionTimerDisplay {...mockProps} />);

      rerender(<SessionTimerDisplay {...mockProps} nowMs={NOW_MS + 1000} />);

      expect(screen.getByLabelText('Session total time')).toHaveTextContent('01:30:01');
    });

    it('opens session notes from the header button', () => {
      render(<SessionTimerDisplay {...mockProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Session notes' }));

      expect(mockProps.onOpenNotes).toHaveBeenCalledWith('session-1');
    });
  });

  describe('Add Timer', () => {
    it('calls onAddTimer from the Timers section button', () => {
      render(<SessionTimerDisplay {...mockProps} />);

      fireEvent.click(screen.getByRole('button', { name: /add timer/i }));

      expect(mockProps.onAddTimer).toHaveBeenCalled();
    });

    it('disables Add Timer at the per-session instance cap', () => {
      const maxedOutSession: TaskSession = {
        ...mockSession,
        timerInstances: Array.from(
          { length: SESSION_CONSTANTS.MAX_TIMER_INSTANCES_PER_SESSION },
          (_, i) => ({ ...stoppedInstance, id: `instance-${i}` })
        ),
      };

      render(<SessionTimerDisplay {...mockProps} session={maxedOutSession} />);

      expect(screen.getByRole('button', { name: /add timer/i })).toBeDisabled();
    });

    it('omits the Add Timer button when no handler is provided', () => {
      render(<SessionTimerDisplay {...mockProps} onAddTimer={undefined} />);

      expect(screen.queryByRole('button', { name: /add timer/i })).not.toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows guidance instead of rows when the session has no timers', () => {
      const emptySession = { ...mockSession, timerInstances: [] };

      render(<SessionTimerDisplay {...mockProps} session={emptySession} />);

      expect(screen.getByText('No timers yet — add one to start tracking.')).toBeInTheDocument();
      expect(screen.queryByTestId('timer-instance')).not.toBeInTheDocument();
      // The Add Timer affordance stays available
      expect(screen.getByRole('button', { name: /add timer/i })).toBeInTheDocument();
    });
  });

  describe('Timer rows', () => {
    it('renders one row per instance with its elapsed time', () => {
      render(<SessionTimerDisplay {...mockProps} />);

      const rows = screen.getAllByTestId('timer-instance');
      expect(rows).toHaveLength(2);
      expect(screen.getByText('01:00:00')).toBeInTheDocument(); // running, live
      expect(screen.getByText('00:30:00')).toBeInTheDocument(); // stopped, stored
    });

    it('shows Pause and Stop for a running timer and wires them up', () => {
      render(<SessionTimerDisplay {...mockProps} session={sessionWith({ state: TimerState.running })} />);

      fireEvent.click(screen.getByRole('button', { name: 'Pause Timer' }));
      expect(mockProps.onPauseTimer).toHaveBeenCalledWith('instance-1');

      fireEvent.click(screen.getByRole('button', { name: 'Stop Timer' }));
      expect(mockProps.onStopTimer).toHaveBeenCalledWith('instance-1');
    });

    it('shows Resume and Stop for a paused timer, frozen at its paused elapsed', () => {
      const pausedSession = sessionWith({
        state: TimerState.paused,
        isRunning: false,
        isPaused: true,
        pausedAt: new Date(START.getTime() + 15 * 60_000), // ran 15 min
      });

      render(<SessionTimerDisplay {...mockProps} session={pausedSession} />);

      // Header total and the row both show the frozen elapsed
      expect(screen.getAllByText('00:15:00')).toHaveLength(2);
      expect(screen.getByText('Paused')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Resume Timer' }));
      expect(mockProps.onResumeTimer).toHaveBeenCalledWith('instance-1');
    });

    it('shows Start and Delete for a fresh (idle) timer', () => {
      render(
        <SessionTimerDisplay
          {...mockProps}
          session={sessionWith({ state: TimerState.idle, isRunning: false, duration: undefined })}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }));
      expect(mockProps.onStartTimer).toHaveBeenCalledWith('instance-1');

      expect(screen.getByRole('button', { name: 'Delete Timer' })).toBeInTheDocument();
    });

    it('offers Edit and Delete but no Start for a completed (stopped) timer', () => {
      // A stopped timer is final; continuing work means adding a new timer.
      const stoppedSession = { ...mockSession, timerInstances: [stoppedInstance] };

      render(<SessionTimerDisplay {...mockProps} session={stoppedSession} />);

      expect(screen.queryByRole('button', { name: 'Start Timer' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Edit Timer' }));
      expect(mockProps.onEditTimer).toHaveBeenCalledWith(stoppedInstance, stoppedSession);

      fireEvent.click(screen.getByRole('button', { name: 'Delete Timer' }));
      expect(mockProps.onDeleteTimer).toHaveBeenCalledWith('instance-2');
    });

    it('opens per-timer notes with the instance id', () => {
      render(<SessionTimerDisplay {...mockProps} session={sessionWith({})} />);

      fireEvent.click(screen.getByRole('button', { name: 'Timer Notes' }));

      expect(mockProps.onOpenNotes).toHaveBeenCalledWith('session-1', 'instance-1');
    });
  });
});
