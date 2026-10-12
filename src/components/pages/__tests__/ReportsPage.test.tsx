import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReportsPage } from '../ReportsPage';
import { TimeEntry } from '../../../types/timer';
import { createLightTheme } from '../../../theme';
import { NotificationProvider } from '../../../contexts/NotificationContext';

vi.mock('../../../hooks/useDailyGoals', () => ({
  useDailyGoals: () => ({ achievements: [], currentGoal: null }),
}));

// Charts are lazy-loaded and irrelevant to the entries table
vi.mock('../../ui/charts/TaskTimeBarChart', () => ({ TaskTimeBarChart: () => null }));
vi.mock('../../ui/charts/TimelineChart', () => ({ TimelineChart: () => null }));
vi.mock('../../ui/charts/TaskDistributionPieChart', () => ({ TaskDistributionPieChart: () => null }));

function recentEntry(): TimeEntry {
  const start = new Date(Date.now() - 2 * 60 * 60_000);
  return {
    id: 'instance-1',
    taskName: 'Annotation',
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60_000),
    duration: 30 * 60_000,
    isRunning: false,
    date: '2026-10-12',
  };
}

function renderPage(onDeleteEntry: (id: string) => void, timeEntries: TimeEntry[] = [recentEntry()]) {
  return render(
    <ThemeProvider theme={createLightTheme()}>
      <NotificationProvider>
        <ReportsPage
          timeEntries={timeEntries}
          tasks={[]}
          onDeleteEntry={onDeleteEntry}
          onUpdateEntry={() => {}}
        />
      </NotificationProvider>
    </ThemeProvider>
  );
}

/** A finished 30-minute entry that started `daysAgo` days ago at noon. */
function entryDaysAgo(daysAgo: number, name: string): TimeEntry {
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(12, 0, 0, 0);
  return {
    ...recentEntry(),
    id: `entry-${daysAgo}`,
    taskName: name,
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60_000),
    date: '',
  };
}

describe('ReportsPage date range', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts on a true last 7 days: today and the 6 days before', () => {
    renderPage(vi.fn(), [entryDaysAgo(6, 'Six days ago'), entryDaysAgo(7, 'Seven days ago')]);

    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Last 7 days');
    expect(screen.getByText('Six days ago')).toBeInTheDocument();
    expect(screen.queryByText('Seven days ago')).not.toBeInTheDocument();
  });

  it('remembers the quick range chosen, not its dates', async () => {
    const { unmount } = renderPage(vi.fn(), [entryDaysAgo(40, 'Long ago')]);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Range' }));
    fireEvent.click(await screen.findByRole('option', { name: 'All time' }));
    expect(screen.getByText('Long ago')).toBeInTheDocument();
    unmount();

    renderPage(vi.fn(), [entryDaysAgo(40, 'Long ago')]);
    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('All time');
    expect(screen.getByText('Long ago')).toBeInTheDocument();
  });

  it('exports what the filters show as CSV', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage(vi.fn());

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});

describe('ReportsPage entry deletion', () => {
  let onDeleteEntry: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onDeleteEntry = vi.fn();
  });

  it('asks for confirmation before deleting an entry', () => {
    renderPage(onDeleteEntry);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleteEntry).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDeleteEntry).toHaveBeenCalledWith('instance-1');
  });

  it('keeps the entry when the confirmation is cancelled', () => {
    renderPage(onDeleteEntry);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(onDeleteEntry).not.toHaveBeenCalled();
  });
});
