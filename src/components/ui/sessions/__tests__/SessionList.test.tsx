/**
 * Unit Tests for SessionList Component
 * 
 * Tests the session list component including session display,
 * selection, activation, and management operations.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionList } from '../SessionList';
import { TaskSession, TimerInstance, TimerState } from '../../../../types/timer';
import { formatDate } from '../../../../utils/formatters';
import { parseDateStringLocal } from '../../../../utils/dateHelpers';

describe('SessionList', () => {
  const mockTimerInstance: TimerInstance = {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: new Date('2024-01-15T11:00:00Z'),
    duration: 3600000, // 1 hour
    state: TimerState.stopped,
    isRunning: false,
    isPaused: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
  };

  const mockSessions: TaskSession[] = [
    {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Development Work',
      timerInstances: [mockTimerInstance],
      totalDuration: 3600000, // 1 hour
      isActive: false,
      date: '2024-01-15',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T11:00:00Z',
    },
    {
      id: 'session-2',
      taskId: 'task-2',
      taskName: 'Code Review',
      timerInstances: [
        {
          ...mockTimerInstance,
          id: 'instance-2',
          sessionId: 'session-2',
          state: TimerState.running,
          isRunning: true,
          endTime: undefined,
        },
      ],
      totalDuration: 1800000, // 30 minutes
      isActive: true,
      date: '2024-01-15',
      createdAt: '2024-01-15T11:00:00Z',
      updatedAt: '2024-01-15T11:30:00Z',
    },
    {
      id: 'session-3',
      taskId: 'task-3',
      taskName: 'Documentation',
      timerInstances: [],
      totalDuration: 0,
      isActive: false,
      date: '2024-01-15',
      createdAt: '2024-01-15T12:00:00Z',
      updatedAt: '2024-01-15T12:00:00Z',
    },
  ];

  const mockProps = {
    sessions: mockSessions,
    onSelectSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onUpdateSession: vi.fn(),
    onStartSession: vi.fn(),
    onStopSession: vi.fn(),
    selectedSessionId: undefined as string | undefined,
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render list of sessions', () => {
      render(<SessionList {...mockProps} />);
      
      expect(screen.getAllByText('Development Work')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Code Review')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Documentation')[0]).toBeInTheDocument();
    });

    it('should display finalized session durations correctly', () => {
      render(<SessionList {...mockProps} />);

      // Only the stopped and empty sessions are deterministic under real
      // timers; the running session's live duration is covered by the
      // fake-timer tests in the Live Durations describe below.
      expect(screen.getByText('01:00:00')).toBeInTheDocument(); // 1 hour, stopped
      expect(screen.getByText('00:00:00')).toBeInTheDocument(); // no instances
    });

    it('should display timer instance counts', () => {
      render(<SessionList {...mockProps} />);

      expect(screen.getAllByText('1 timer')).toHaveLength(2); // Two sessions have 1 timer each
      expect(screen.getByText('0 timers')).toBeInTheDocument();
    });

    it('should show loading state when isLoading is true', () => {
      render(<SessionList {...mockProps} isLoading={true} />);

      expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });

    it('should show empty state when no sessions', () => {
      render(<SessionList {...mockProps} sessions={[]} />);

      expect(screen.getByText('No sessions found. Create your first session to get started!')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should filter sessions by task', () => {
      render(<SessionList {...mockProps} />);

      const chip = screen.getByRole('button', { name: 'Code Review' });
      fireEvent.click(chip);

      expect(screen.getAllByText('Code Review')[0]).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Development Work' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Documentation' })
      ).not.toBeInTheDocument();
    });

    it('should hide archived task names from the filter chips but keep their sessions', () => {
      render(<SessionList {...mockProps} archivedTaskNames={['Documentation']} />);

      // No chip for the archived task, chips for active tasks remain
      expect(screen.queryByRole('button', { name: 'Documentation' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Development Work' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Code Review' })).toBeInTheDocument();

      // The archived task's session history still renders
      expect(screen.getByRole('heading', { name: 'Documentation' })).toBeInTheDocument();
    });

    it('should keep an archived task chip visible while it is selected', () => {
      const { rerender } = render(<SessionList {...mockProps} />);

      // Select the chip while the task is still active
      fireEvent.click(screen.getByRole('button', { name: 'Documentation' }));

      // The task gets archived while its filter is applied
      rerender(<SessionList {...mockProps} archivedTaskNames={['Documentation']} />);

      // The chip stays so the filter can be cleared...
      const chip = screen.getByRole('button', { name: 'Documentation' });
      fireEvent.click(chip);

      // ...and disappears once deselected
      expect(screen.queryByRole('button', { name: 'Documentation' })).not.toBeInTheDocument();
    });

    it('should filter sessions by status', () => {
      render(<SessionList {...mockProps} />);

      const select = screen.getByLabelText('Status');
      fireEvent.mouseDown(select);
      const listbox = screen.getByRole('listbox');
      fireEvent.click(within(listbox).getByText('Active'));

      expect(screen.getAllByText('Code Review')[0]).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Development Work' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Documentation' })
      ).not.toBeInTheDocument();
    });
  });

  describe('Session States', () => {
    it('should show active session indicator', () => {
      render(<SessionList {...mockProps} />);

      expect(screen.getAllByText('Active')[0]).toBeInTheDocument();
    });

    it('should highlight selected session', () => {
      const propsWithSelection = {
        ...mockProps,
        selectedSessionId: mockSessions[0].id,
      };

      render(<SessionList {...propsWithSelection} />);

      // The selected session should have different border styling
      // We can't easily test CSS styles, so we'll just verify the component renders
      expect(screen.getAllByText('Development Work')[0]).toBeInTheDocument();
    });

    it('should show running indicator for sessions with running timers', () => {
      render(<SessionList {...mockProps} />);

      expect(screen.getByText('1 running')).toBeInTheDocument();
    });

    it('should not show running indicator for sessions without running timers', () => {
      const sessionsWithoutRunning = [
        {
          ...mockSessions[0],
          timerInstances: [
            {
              ...mockTimerInstance,
              isRunning: false,
              isPaused: false,
            },
          ],
        },
      ];

      render(<SessionList {...mockProps} sessions={sessionsWithoutRunning} />);

      expect(screen.queryByText('1 running')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onSelectSession when session is clicked', () => {
      render(<SessionList {...mockProps} />);

      const sessionTitle = screen
        .getAllByText('Development Work')
        .find(el => el.tagName.toLowerCase() === 'h6');
      const sessionCard = sessionTitle?.closest('.MuiCard-root');
      fireEvent.click(sessionCard!);

      expect(mockProps.onSelectSession).toHaveBeenCalledWith(mockSessions[0]);
    });

    it('should open context menu when more button is clicked', () => {
      render(<SessionList {...mockProps} />);

      const moreButtons = screen.getAllByRole('button');
      const moreButton = moreButtons.find(button =>
        button.querySelector('[data-testid="MoreVertIcon"]')
      );

      fireEvent.click(moreButton!);

      expect(screen.getByText('Activate Session')).toBeInTheDocument();
      expect(screen.getByText('Delete Session')).toBeInTheDocument();
    });

    it('should call onStartSession when the activate menu item is clicked', () => {
      render(<SessionList {...mockProps} />);

      // Open context menu
      const moreButtons = screen.getAllByRole('button');
      const moreButton = moreButtons.find(button =>
        button.querySelector('[data-testid="MoreVertIcon"]')
      );
      fireEvent.click(moreButton!);

      // Click activate session
      const startMenuItem = screen.getByText('Activate Session');
      fireEvent.click(startMenuItem);

      expect(mockProps.onStartSession).toHaveBeenCalled();
    });

    it('should call onDeleteSession when delete menu item is clicked', () => {
      render(<SessionList {...mockProps} />);

      // Open context menu
      const moreButtons = screen.getAllByRole('button');
      const moreButton = moreButtons.find(button =>
        button.querySelector('[data-testid="MoreVertIcon"]')
      );
      fireEvent.click(moreButton!);

      // Click delete session
      const deleteMenuItem = screen.getByText('Delete Session');
      fireEvent.click(deleteMenuItem);

      expect(mockProps.onDeleteSession).toHaveBeenCalled();
    });
  });

  describe('Session Details', () => {
    it('should display session creation date as the local calendar day', () => {
      render(<SessionList {...mockProps} />);

      // Parsed as a LOCAL date: new Date('YYYY-MM-DD') would be UTC midnight
      // and render the previous day west of UTC.
      const expectedDate = formatDate(parseDateStringLocal(mockSessions[0].date));
      expect(screen.getAllByText(expectedDate)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/January 15, 2024/)[0]).toBeInTheDocument();
    });

    it('should display session task information', () => {
      render(<SessionList {...mockProps} />);
      
      expect(screen.getAllByText('Development Work')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Code Review')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Documentation')[0]).toBeInTheDocument();
    });

    it('should show session notes when available', () => {
      const sessionsWithNotes = [
        {
          ...mockSessions[0],
          notes: 'Working on user authentication feature',
        },
      ];
      
      render(<SessionList {...mockProps} sessions={sessionsWithNotes} />);
      
      expect(screen.getByText('Working on user authentication feature')).toBeInTheDocument();
    });

    it('should display long session notes with CSS truncation', () => {
      const longNote = 'This is a very long note that should be truncated when displayed in the session list to prevent the UI from becoming cluttered and unreadable';
      const sessionsWithLongNotes = [
        {
          ...mockSessions[0],
          notes: longNote,
        },
      ];

      render(<SessionList {...mockProps} sessions={sessionsWithLongNotes} />);

      const noteElement = screen.getByText(longNote);
      expect(noteElement).toBeInTheDocument();
      // CSS truncation is applied via WebkitLineClamp, so the full text is still in the DOM
      expect(noteElement.textContent).toBe(longNote);
    });
  });

  describe('Live Durations', () => {
    // One hour after the running fixture's 10:00Z start. Duration math is
    // timezone-independent, so an absolute UTC instant keeps this exact.
    const NOW = new Date('2024-01-15T11:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('derives durations from timer instances instead of stale totalDuration', () => {
      render(<SessionList {...mockProps} />);

      // Code Review's timer has run for 1h, but the backend only counts
      // finalized instances, so its totalDuration still says 30m. The old
      // code rendered that stale 00:30:00.
      expect(screen.queryByText('00:30:00')).not.toBeInTheDocument();
      // Live 1h for Code Review plus the stored 1h for stopped Development Work
      expect(screen.getAllByText('01:00:00')).toHaveLength(2);
    });

    it('ticks running session durations forward once a second', () => {
      render(<SessionList {...mockProps} />);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Only the running session moves; the stopped one stays frozen
      expect(screen.getByText('01:00:01')).toBeInTheDocument();
      expect(screen.getByText('01:00:00')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(59_000);
      });

      expect(screen.getByText('01:01:00')).toBeInTheDocument();
      expect(screen.getByText('01:00:00')).toBeInTheDocument();
    });

    it('freezes paused sessions and registers no tick without running timers', () => {
      const pausedSession: TaskSession = {
        id: 'session-paused',
        taskId: 'task-4',
        taskName: 'Paused Work',
        timerInstances: [
          {
            id: 'instance-paused',
            sessionId: 'session-paused',
            startTime: new Date('2024-01-15T10:00:00Z'),
            state: TimerState.paused,
            isRunning: false,
            isPaused: true,
            pausedAt: new Date('2024-01-15T10:15:00Z'), // ran 15 min, then paused
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-15T10:15:00Z',
          },
        ],
        // Paused instances are not finalized either, so the backend total is 0
        totalDuration: 0,
        isActive: false,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:15:00Z',
      };

      render(<SessionList {...mockProps} sessions={[pausedSession]} />);

      expect(screen.getByText('00:15:00')).toBeInTheDocument();
      // The 1s interval is gated on a running timer existing
      expect(vi.getTimerCount()).toBe(0);

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(screen.getByText('00:15:00')).toBeInTheDocument();
    });
  });
});
