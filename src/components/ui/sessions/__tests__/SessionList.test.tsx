/**
 * Unit Tests for SessionList Component
 *
 * Tests the session list component including session display,
 * selection, activation, and management operations.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionList } from '../SessionList';
import { TaskSession, TimerInstance, TimerState } from '../../../../types/timer';
import { formatDate } from '../../../../utils/formatters';
import { parseDateStringLocal } from '../../../../utils/dateHelpers';

describe('SessionList', () => {
  // One hour after the running fixture's 10:00Z start. Duration math is
  // timezone-independent, so an absolute UTC instant keeps tests exact.
  const NOW_MS = new Date('2024-01-15T11:00:00Z').getTime();

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
    nowMs: NOW_MS,
    onSelectSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onStartSession: vi.fn(),
    onStopSession: vi.fn(),
    onCreateSession: vi.fn(),
    selectedSessionId: undefined as string | undefined,
    isLoading: false,
    onEditSession: vi.fn(),
    onOpenNotes: vi.fn(),
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

    it('should display durations in the live format for active sessions and as plain durations otherwise', () => {
      render(<SessionList {...mockProps} />);

      // The active session ticks in HH:MM:SS off the shared clock
      expect(screen.getByText('01:00:00')).toBeInTheDocument();
      // Finished sessions read as plain durations
      expect(screen.getByText('1h 0m')).toBeInTheDocument(); // stopped, 1 hour
      expect(screen.getByText('0h 0m')).toBeInTheDocument(); // no instances
    });

    it('should display timer instance counts', () => {
      render(<SessionList {...mockProps} />);

      expect(screen.getAllByText('1 timer')).toHaveLength(2); // Two sessions have 1 timer each
      expect(screen.getByText('0 timers')).toBeInTheDocument();
    });

    it('should show skeleton placeholders while loading', () => {
      const { container } = render(<SessionList {...mockProps} isLoading={true} />);

      expect(container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(3);
      expect(screen.queryByText('Loading sessions...')).not.toBeInTheDocument();
    });

    it('should show an empty state with a create CTA when no sessions exist', () => {
      render(<SessionList {...mockProps} sessions={[]} />);

      expect(screen.getByText('No sessions yet')).toBeInTheDocument();
      expect(screen.getByText('Start a session to begin tracking your time.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /start a session/i }));
      expect(mockProps.onCreateSession).toHaveBeenCalled();
    });

    it('should omit the empty-state CTA when no create handler is provided', () => {
      render(<SessionList {...mockProps} sessions={[]} onCreateSession={undefined} />);

      expect(screen.getByText('No sessions yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /start a session/i })).not.toBeInTheDocument();
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

    it('should show a no-matches state whose Clear filters action restores the list', () => {
      render(<SessionList {...mockProps} />);

      fireEvent.change(screen.getByLabelText('Search sessions'), {
        target: { value: 'zzz-nothing-matches' },
      });

      expect(screen.getByText('No matching sessions')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

      expect(screen.queryByText('No matching sessions')).not.toBeInTheDocument();
      expect(screen.getAllByText('Development Work')[0]).toBeInTheDocument();
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

    function openDeleteFor(taskName: string) {
      // The name also appears as a filter chip; the card is the one to act on
      const card = screen
        .getAllByText(taskName)
        .map(node => node.closest('.MuiCard-root'))
        .find(Boolean) as HTMLElement;
      fireEvent.click(within(card).getByRole('button', { name: 'More options' }));
      fireEvent.click(screen.getByText('Delete Session'));
    }

    it('asks for confirmation, naming the tracked time, before deleting a session', () => {
      render(<SessionList {...mockProps} />);

      openDeleteFor('Development Work');

      expect(mockProps.onDeleteSession).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/1 timer and 1h 0m of tracked time/)).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      expect(mockProps.onDeleteSession).toHaveBeenCalledWith('session-1');
    });

    it('does not delete the session when the confirmation is cancelled', () => {
      render(<SessionList {...mockProps} />);

      openDeleteFor('Development Work');
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      expect(mockProps.onDeleteSession).not.toHaveBeenCalled();
    });

    it('warns that deleting the active session takes its running timer with it', () => {
      render(<SessionList {...mockProps} />);

      openDeleteFor('Code Review');

      expect(
        within(screen.getByRole('dialog')).getByText(/This is the active session/)
      ).toBeInTheDocument();
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
    it('derives durations from timer instances instead of stale totalDuration', () => {
      render(<SessionList {...mockProps} />);

      // Code Review's timer has run for 1h, but the backend only counts
      // finalized instances, so its totalDuration still says 30m. The old
      // code rendered that stale value.
      expect(screen.queryByText('00:30:00')).not.toBeInTheDocument();
      expect(screen.queryByText('0h 30m')).not.toBeInTheDocument();
      // Live 1h for the active Code Review session
      expect(screen.getByText('01:00:00')).toBeInTheDocument();
    });

    it('re-renders the active session from the shared clock prop', () => {
      const { rerender } = render(<SessionList {...mockProps} />);

      expect(screen.getByText('01:00:00')).toBeInTheDocument();

      rerender(<SessionList {...mockProps} nowMs={NOW_MS + 1000} />);

      // Only the active session moves; finished ones stay frozen
      expect(screen.getByText('01:00:01')).toBeInTheDocument();
      expect(screen.getByText('1h 0m')).toBeInTheDocument();
    });

    it('owns no interval of its own — the shared page clock is the only ticker', () => {
      vi.useFakeTimers();
      try {
        render(<SessionList {...mockProps} />);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows a paused session frozen at its paused elapsed', () => {
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

      const { rerender } = render(
        <SessionList {...mockProps} sessions={[pausedSession]} />
      );

      expect(screen.getByText('0h 15m')).toBeInTheDocument();

      // Advancing the shared clock leaves the frozen elapsed untouched
      rerender(
        <SessionList {...mockProps} sessions={[pausedSession]} nowMs={NOW_MS + 60_000} />
      );

      expect(screen.getByText('0h 15m')).toBeInTheDocument();
    });
  });
});
