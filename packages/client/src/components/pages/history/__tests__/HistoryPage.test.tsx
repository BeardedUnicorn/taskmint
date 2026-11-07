/**
 * History page (formerly Reports + Time Entries): filters and quick ranges,
 * summary, charts card, the sortable / paginated entries table, deletion,
 * and CSV export.
 */

import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ComponentProps } from 'react';
import { HistoryPage } from '../HistoryPage';
import { Sidebar } from '../../../layout/Sidebar';
import { TimeEntry } from '../../../../types/timer';
import { Task } from '../../../../types/task';
import { createAppTheme } from '../../../../theme';
import { NotificationProvider } from '../../../../contexts/NotificationContext';
import { defaultFilters } from '../../../ui/filters/TimeEntriesFilters';
import { fakeBackend } from '../../../../testing';
import type { DailyGoal, DailyGoalAchievement } from '../../../../types/goal';

// Stable object: a fresh one per render would re-run the page's memos
const mockGoals: { achievements: DailyGoalAchievement[]; currentGoal: DailyGoal | null } = {
  achievements: [],
  currentGoal: null,
};
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

type PageProps = ComponentProps<typeof HistoryPage>;

function page(entries: TimeEntry[], props: Partial<PageProps> = {}) {
  return (
    <ThemeProvider theme={createAppTheme('light')}>
      <NotificationProvider>
        <HistoryPage
          timeEntries={entries}
          tasks={tasks}
          onUpdateEntry={() => {}}
          onDeleteEntry={() => {}}
          onAddTime={() => {}}
          focusTask={null}
          onFocusApplied={() => {}}
          {...props}
        />
      </NotificationProvider>
    </ThemeProvider>
  );
}

function renderPage(entries: TimeEntry[], props: Partial<PageProps> = {}) {
  return render(page(entries, props));
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

  describe('on a set day', () => {
    // Only Date is faked: MUI's timers and findBy* keep running
    const at = (now: Date) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
    };
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['a Saturday, when this week is the same days', new Date(2026, 10, 7, 15)],
      ['a Wednesday', new Date(2026, 10, 4, 15)],
    ])('calls the default range Last 7 days on %s', (_, now) => {
      at(now);
      renderPage([entryDaysAgo(6, 'Six days ago')]);
      expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Last 7 days');
      expect(screen.getByText('Six days ago')).toBeInTheDocument();
      expect(screen.queryByText(/active$/)).not.toBeInTheDocument();
    });

    it('calls This week by its name on a Saturday, and counts it as a filter', async () => {
      at(new Date(2026, 10, 7, 15));
      renderPage([entryDaysAgo(6, 'Six days ago')]);

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Range' }));
      fireEvent.click(await screen.findByRole('option', { name: 'This week' }));
      expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('This week');
      expect(screen.getByText('1 active')).toBeInTheDocument();
    });
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

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
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

  it('deletes an entry straight away (its toast offers Undo)', () => {
    const onDeleteEntry = vi.fn();
    renderPage(makeEntries().slice(0, 1), { onDeleteEntry });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleteEntry).toHaveBeenCalledWith('instance-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('counts only finished entries for export, and exports them', async () => {
    const entries = makeEntries();
    entries[29] = { ...entries[29], isRunning: true, duration: undefined, endTime: undefined };
    renderPage(entries);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV (29)' }));
    });

    expect(fakeBackend().platform.files.save).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'csv', suggestedName: expect.stringMatching(/\.csv$/) })
    );
    const [{ contents }] = fakeBackend().platform.files.save.mock.calls[0];
    // A header and the 29 finished entries
    expect(contents.trim().split('\r\n')).toHaveLength(30);
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

describe('HistoryPage opened from a task', () => {
  it("shows all of that task's entries, then forgets the request", () => {
    const other: Task = { id: 'task-2', name: 'Other', createdAt: '', updatedAt: '' };
    const onFocusApplied = vi.fn();
    const old = { ...entryDaysAgo(90, 'Annotation'), taskId: 'task-1' };
    const otherTask = { ...entryDaysAgo(1, 'Other'), id: 'other', taskId: 'task-2' };
    render(
      <ThemeProvider theme={createAppTheme('light')}>
        <NotificationProvider>
          <HistoryPage
            timeEntries={[old, otherTask]}
            tasks={[...tasks, other]}
            onUpdateEntry={() => {}}
            onDeleteEntry={() => {}}
            onAddTime={() => {}}
            focusTask={tasks[0]}
            onFocusApplied={onFocusApplied}
          />
        </NotificationProvider>
      </ThemeProvider>
    );

    const table = screen.getByRole('table');
    expect(within(table).getByText('Annotation')).toBeInTheDocument(); // 90 days ago: all time
    expect(within(table).queryByText('Other')).not.toBeInTheDocument();
    expect(onFocusApplied).toHaveBeenCalledTimes(1);
  });
});

describe('HistoryPage when there is nothing to show', () => {
  it('says nothing was tracked yet, with no filters to clear', () => {
    renderPage([]);
    expect(screen.getByText('Nothing tracked yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('says no entries match, and clears the filters', () => {
    renderPage([entryDaysAgo(40, 'Long ago')]);
    expect(screen.getByText('No entries match')).toBeInTheDocument();

    saveFilters({ datePreset: 'all' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('No entries match')).toBeInTheDocument();
  });
});

describe('HistoryPage actions', () => {
  beforeEach(() => {
    saveFilters({ datePreset: 'all' });
  });

  it('opens Add time, and the advanced filters', () => {
    const onAddTime = vi.fn();
    renderPage(makeEntries(), { onAddTime });

    fireEvent.click(screen.getByRole('button', { name: 'Add time' }));
    expect(onAddTime).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Expand filters' }));
    expect(screen.getByRole('button', { name: 'Collapse filters' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('pages through the entries, and starts over on page 1 with a new page size', async () => {
    renderPage(makeEntries());

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect(visibleTaskNames()).toHaveLength(5);
    expect(screen.getByText(/Showing 26-30 of 30 entries/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Per page' }));
    fireEvent.click(await screen.findByRole('option', { name: '10' }));
    expect(visibleTaskNames()).toHaveLength(10);
    expect(screen.getByText(/Showing 1-10 of 30 entries/)).toBeInTheDocument();
  });

  it('shows the page before when the last page empties', () => {
    const entries = makeEntries().slice(0, 26);
    const { rerender } = renderPage(entries);
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));

    rerender(page(entries.slice(1)));
    expect(screen.getByText(/Showing 1-25 of 25 entries/)).toBeInTheDocument();
    expect(visibleTaskNames()).toHaveLength(25);
  });

  it('edits an entry in a dialog, and closes it without saving', async () => {
    const onUpdateEntry = vi.fn();
    renderPage([entryDaysAgo(1, 'Annotation')], { onUpdateEntry });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(onUpdateEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '45' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onUpdateEntry).toHaveBeenCalledWith({ id: 'entry-1-Annotation', taskId: 'task-1', durationMs: 45 * 60_000 });
  });

  it("keeps an entry's deleted task when editing it, and asks for one when it never had one", async () => {
    const onUpdateEntry = vi.fn();
    const orphan = { ...entryDaysAgo(1, 'Gone'), taskId: 'deleted-task' };
    const { unmount } = renderPage([orphan], { onUpdateEntry });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(onUpdateEntry).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'deleted-task' }));
    unmount();

    renderPage([{ ...entryDaysAgo(1, 'Never linked'), taskId: undefined }], { onUpdateEntry });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Choose a task')).toBeInTheDocument();
    expect(onUpdateEntry).toHaveBeenCalledTimes(1);
  });

  it('switches the timeline between days, weeks and months', async () => {
    renderPage(makeEntries());

    for (const view of ['Weekly', 'Monthly', 'Daily']) {
      fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Timeline View' }));
      fireEvent.click(await screen.findByRole('option', { name: view }));
      expect(screen.getByRole('combobox', { name: 'Timeline View' })).toHaveTextContent(view);
    }
  });

  it("shows the goal's past results even with the goal off now", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    mockGoals.achievements = [
      {
        id: 'a1',
        date: day,
        goalAmount: 100,
        earnedAmount: 0,
        currency: 'USD',
        percentageAchieved: 0,
        status: 'missed',
        difference: -100,
        recordedAt: '2026-01-01T00:00:00Z',
      },
    ];
    try {
      renderPage(makeEntries());
      expect(screen.getByText('Daily goal')).toBeInTheDocument();
    } finally {
      mockGoals.achievements = [];
    }
  });

  it('applies a focus request once, however often its effect runs', () => {
    const onFocusApplied = vi.fn();
    render(page(makeEntries(), { focusTask: tasks[0], onFocusApplied }), { reactStrictMode: true });
    expect(onFocusApplied).toHaveBeenCalledTimes(1);
  });
});
