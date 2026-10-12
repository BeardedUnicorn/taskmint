import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TimeEntriesPage } from '../TimeEntriesPage';
import { TimeEntry } from '../../../types/timer';
import { createLightTheme } from '../../../theme';
import { NotificationProvider } from '../../../contexts/NotificationContext';

const ENTRY_COUNT = 30;

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

function renderPage(entries: TimeEntry[]) {
  return render(
    <ThemeProvider theme={createLightTheme()}>
      <NotificationProvider>
        <TimeEntriesPage
          timeEntries={entries}
          tasks={[]}
          onUpdateEntry={() => {}}
          onDeleteEntry={() => {}}
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

describe('TimeEntriesPage sorting and pagination', () => {
  beforeEach(() => {
    window.localStorage.clear();
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
});

describe('TimeEntriesPage saved filters and export', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const saveFilters = (filters: Record<string, unknown>) =>
    window.localStorage.setItem(
      'timeEntriesFilters',
      JSON.stringify({ version: 1, data: { ...filters }, migratedAt: '2026-10-01T00:00:00Z' })
    );

  it('reads saved dates back as dates (they are stored as text)', () => {
    saveFilters({
      searchQuery: '',
      selectedTasks: [],
      startDate: new Date(2026, 8, 10).toISOString(),
      endDate: new Date(2026, 8, 12).toISOString(),
      minDuration: null,
      maxDuration: null,
      status: 'all',
    });
    renderPage(makeEntries());

    expect(visibleTaskNames()).toEqual(['Task 12', 'Task 11', 'Task 10']);
  });

  it('counts only finished entries for export, and exports them', () => {
    const entries = makeEntries();
    entries[29] = { ...entries[29], isRunning: true, duration: undefined, endTime: undefined };
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage(entries);

    const exportButton = screen.getByRole('button', { name: 'Export CSV (29)' });
    fireEvent.click(exportButton);

    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
