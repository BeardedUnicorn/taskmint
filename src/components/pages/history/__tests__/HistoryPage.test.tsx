/**
 * History page (formerly Reports + Time Entries): filters and quick ranges,
 * summary, charts card, the sortable / paginated entries table, deletion,
 * and CSV export.
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { HistoryPage } from '../HistoryPage';
import { Sidebar } from '../../../layout/Sidebar';
import { TimeEntry } from '../../../../types/timer';
import { Task } from '../../../../types/task';
import { createLightTheme } from '../../../../theme';
import { NotificationProvider } from '../../../../contexts/NotificationContext';
import { defaultFilters } from '../../../ui/filters/TimeEntriesFilters';

// Stable object: a fresh one per render would re-run the page's memos
const mockGoals = { achievements: [], currentGoal: null };
vi.mock('../../../../hooks/useDailyGoals', () => ({
  useDailyGoals: () => mockGoals,
}));

// Charts are lazy-loaded and irrelevant here
vi.mock('../../../ui/charts/TaskTimeBarChart', () => ({ TaskTimeBarChart: () => <div>bar chart</div> }));
vi.mock('../../../ui/charts/TimelineChart', () => ({ TimelineChart: () => null }));
vi.mock('../../../ui/charts/TaskDistributionPieChart', () => ({ TaskDistributionPieChart: () => null }));

const ENTRY_COUNT = 30;
const HOUR = 3_600_000;
const tasks: Task[] = [
  { id: 'task-1', name: 'Annotation', hourlyRate: 60, createdAt: '', updatedAt: '' },
];

// Entries arrive the way sessionsToTimeEntries produces them: oldest first.
// Durations are a permutation of 1..30 minutes unrelated to that order, so a
// duration sort can't pass by accident.
function makeEntries(): TimeEntry[] {
  return Array.from({ length: ENTRY_COUNT }, (_, index) => {
    const i = index + 1;
    const start = new Date(2026, 8, i, 9, 0, 0);
    const durationMinutes = ((i * 7) % ENTRY_COUNT) + 1;
    return {
      id: `instance-${i}`,
      taskName: `Task ${String(i).padStart(2, '0')}`,
      startTime: start,
      endTime: new Date(start.getTime() + durationMinutes * 60_000),
      duration: durationMinutes * 60_000,
      isRunning: false,
      date: `2026-09-${String(i).padStart(2, '0')}`,
    };
  });
}

/** A finished entry that started `daysAgo` days ago at noon. */
function entryDaysAgo(daysAgo: number, name: string, hours = 0.5): TimeEntry {
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(12, 0, 0, 0);
  return {
    id: `entry-${daysAgo}-${name}`,
    taskId: 'task-1',
    taskName: name,
    startTime: start,
    endTime: new Date(start.getTime() + hours * HOUR),
    duration: hours * HOUR,
    isRunning: false,
    date: '',
    hourlyRate: 60,
  };
}

const saveFilters = (filters: Record<string, unknown>) =>
  window.localStorage.setItem(
    'timeEntriesFilters',
    JSON.stringify({ version: 1, data: { ...defaultFilters, ...filters }, migratedAt: '2026-10-01T00:00:00Z' })
  );

function renderPage(entries: TimeEntry[], onDeleteEntry: (id: string) => void = () => {}) {
  return render(
    <ThemeProvider theme={createLightTheme()}>
      <NotificationProvider>
        <HistoryPage
          timeEntries={entries}
          tasks={tasks}
          onUpdateEntry={() => {}}
          onDeleteEntry={onDeleteEntry}
        />
      </NotificationProvider>
    </ThemeProvider>
  );
}

function visibleTaskNames(): string[] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByText(/^Task \d{2}$/)
    .map(node => node.textContent ?? '');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('HistoryPage date range', () => {
  it('opens on the last 7 days (today and the 6 before), with the range picker in view', () => {
    renderPage([entryDaysAgo(6, 'Six days ago'), entryDaysAgo(7, 'Seven days ago')]);

    // Visible without expanding the advanced filters
    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Last 7 days');
    expect(screen.getByText('Six days ago')).toBeInTheDocument();
    expect(screen.queryByText('Seven days ago')).not.toBeInTheDocument();
    // The default range isn't counted as a filter
    expect(screen.queryByText(/active$/)).not.toBeInTheDocument();
  });

  it('remembers the range chosen, and Clear goes back to the last 7 days', async () => {
    const { unmount } = renderPage([entryDaysAgo(40, 'Long ago')]);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Range' }));
    fireEvent.click(await screen.findByRole('option', { name: 'All time' }));
    expect(screen.getByText('Long ago')).toBeInTheDocument();
    expect(screen.getByText('1 active')).toBeInTheDocument();
    unmount();

    renderPage([entryDaysAgo(40, 'Long ago')]);
    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('All time');

    fireEvent.click(screen.getByTitle('Clear all filters'));
    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Last 7 days');
    expect(screen.queryByText('Long ago')).not.toBeInTheDocument();
  });

  it('reads saved dates back as dates (they are stored as text)', () => {
    saveFilters({
      startDate: new Date(2026, 8, 10).toISOString(),
      endDate: new Date(2026, 8, 12).toISOString(),
      datePreset: null,
    });
    renderPage(makeEntries());

    expect(visibleTaskNames()).toEqual(['Task 12', 'Task 11', 'Task 10']);
  });
});

describe('HistoryPage summary and charts', () => {
  it('totals the finished entries in range; a running timer is left out', () => {
    const running = { ...entryDaysAgo(0, 'Running now'), isRunning: true, duration: undefined, endTime: undefined };
    renderPage([entryDaysAgo(1, 'Yesterday', 1.5), entryDaysAgo(2, 'Before', 0.5), running]);

    const summary = screen.getByLabelText('Summary');
    expect(within(summary).getByText('2h 0m')).toBeInTheDocument();
    expect(within(summary).getByText('$120.00')).toBeInTheDocument();
    // Two entries, on two tasks
    expect(within(summary).getAllByText('2')).toHaveLength(2);
  });

  it('remembers whether the charts are shown', async () => {
    const { unmount } = renderPage([entryDaysAgo(1, 'Yesterday')]);
    expect(await screen.findByText('bar chart')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide charts' }));
    unmount();

    renderPage([entryDaysAgo(1, 'Yesterday')]);
    expect(screen.getByRole('button', { name: 'Show charts' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('bar chart')).not.toBeInTheDocument();
  });
});

describe('HistoryPage entries table', () => {
  beforeEach(() => {
    saveFilters({ datePreset: 'all' });
  });

  it('shows the newest entries on page 1 by default', () => {
    renderPage(makeEntries());

    const names = visibleTaskNames();
    expect(names).toHaveLength(25);
    expect(names[0]).toBe('Task 30');
    expect(names).not.toContain('Task 01');
    expect(names).not.toContain('Task 05');
  });

  it('sorts across every page, not just the visible one', () => {
    const entries = makeEntries();
    renderPage(entries);

    // First click on a new column sorts ascending
    fireEvent.click(screen.getByText('Duration'));

    const shortestFirst = [...entries]
      .sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0))
      .map(e => e.taskName);
    expect(visibleTaskNames()).toEqual(shortestFirst.slice(0, 25));
  });

  it('asks before deleting an entry', () => {
    const onDeleteEntry = vi.fn();
    renderPage(makeEntries().slice(0, 1), onDeleteEntry);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteEntry).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(onDeleteEntry).toHaveBeenCalledWith('instance-1');
  });

  it('keeps the entry when the confirmation is cancelled', () => {
    const onDeleteEntry = vi.fn();
    renderPage(makeEntries().slice(0, 1), onDeleteEntry);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(onDeleteEntry).not.toHaveBeenCalled();
  });

  it('counts only finished entries for export, and exports them', () => {
    const entries = makeEntries();
    entries[29] = { ...entries[29], isRunning: true, duration: undefined, endTime: undefined };
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage(entries);

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV (29)' }));

    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});

describe('Sidebar', () => {
  it('has one History page in place of Time Entries and Reports', () => {
    render(<Sidebar activeView="history" onViewChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.queryByText('Time Entries')).not.toBeInTheDocument();
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
  });
});
