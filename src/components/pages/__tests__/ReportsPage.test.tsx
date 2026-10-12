import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReportsPage } from '../ReportsPage';
import { TimeEntry } from '../../../types/timer';
import { createLightTheme } from '../../../theme';

vi.mock('../../../hooks/useDailyGoals', () => ({
  useDailyGoals: () => ({ getAchievementsForDateRange: async () => [] }),
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

function renderPage(onDeleteEntry: (id: string) => void) {
  return render(
    <ThemeProvider theme={createLightTheme()}>
      <ReportsPage
        timeEntries={[recentEntry()]}
        tasks={[]}
        onDeleteEntry={onDeleteEntry}
        onUpdateEntry={() => {}}
      />
    </ThemeProvider>
  );
}

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
