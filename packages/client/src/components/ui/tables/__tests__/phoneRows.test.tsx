/**
 * The tables as a phone shows them: rows one under another, each with what
 * it is, its figure, its details and its actions.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { Edit as EditIcon } from '@mui/icons-material';
import { RowMenu, StackedList, StackedRow } from '../StackedRows';
import { TimeEntryRows } from '../TimeEntryRows';
import { TimeEntriesTable } from '../TimeEntriesTable';
import { GoalAchievementsTable } from '../GoalAchievementsTable';
import { TimeEntry } from '../../../../types/timer';
import { DailyGoalAchievement } from '../../../../types/goal';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';
import { setPhoneViewport } from '../../../../__tests__/setup/viewport';

const base: TimeEntry = {
  id: 'tracked',
  taskId: 'task-1',
  taskName: 'Writing',
  startTime: new Date(2026, 9, 1, 10, 0),
  endTime: new Date(2026, 9, 1, 11, 0),
  duration: 3_600_000,
  isRunning: false,
  date: '2026-10-01',
};
const tasks = [createMockTask({ id: 'task-1', name: 'Writing', hourlyRate: 30 })];
const rowsOf = (label: string) => within(screen.getByRole('list', { name: label })).getAllByRole('listitem');

describe('StackedRow', () => {
  it('is a button when the whole row opens something, and marks a selected one', () => {
    const onClick = vi.fn();
    render(
      <StackedList label="Rows">
        <StackedRow title="Opens" onClick={onClick} label="Open it" selected />
        <StackedRow title="Just shows" figure="$1.00" details="More" />
      </StackedList>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(onClick).toHaveBeenCalled();
    const [opens, shows] = rowsOf('Rows');
    expect(opens).not.toHaveStyle({ backgroundColor: 'rgba(0, 0, 0, 0)' });
    expect(shows).toHaveTextContent('Just shows$1.00More');
    expect(within(shows).queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps actions behind one menu, the destructive ones in red', () => {
    const edit = vi.fn();
    render(<RowMenu label="Actions for this" actions={[{ label: 'Edit', icon: <EditIcon />, onClick: edit }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for this' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(edit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for this' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(edit).toHaveBeenCalledTimes(1);
  });
});

describe('TimeEntryRows', () => {
  it("names History's rows by task, with the day, times, length, source and earnings", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <TimeEntryRows
        entries={[
          base,
          { ...base, id: 'manual', source: 'manual' },
          { ...base, id: 'imported', source: 'worklog-import', endTime: undefined },
          { ...base, id: 'running', endTime: undefined, duration: undefined },
          { ...base, id: 'no-length', duration: undefined, endTime: new Date(2026, 9, 1, 10, 45) },
        ]}
        tasks={tasks}
        onEdit={onEdit}
        onDelete={onDelete}
        showTask
        label="Time entries"
      />
    );
    const [tracked, manual, imported, running, noLength] = rowsOf('Time entries');
    // An older entry with no length of its own: from its end
    expect(noLength).toHaveTextContent('10:00 AM – 10:45 AM0h 45m');
    expect(tracked).toHaveTextContent('Writing$30.00Oct 1, 2026 · 10:00 AM – 11:00 AM1h 0m');
    expect(within(tracked).queryByText('Tracked')).not.toBeInTheDocument();
    expect(within(manual).getByText('Manual')).toBeInTheDocument();
    // An imported day: its end from its length, and read-only
    expect(imported).toHaveTextContent('10:00 AM – 11:00 AM');
    expect(within(imported).getByText('Imported')).toBeInTheDocument();
    expect(within(imported).getByLabelText('Imported entries are read-only')).toBeInTheDocument();
    expect(within(imported).queryByRole('button')).not.toBeInTheDocument();
    expect(running).toHaveTextContent('10:00 AM – now');
    expect(within(running).getByText('Running')).toBeInTheDocument();

    fireEvent.click(within(tracked).getByRole('button', { name: 'Actions for Writing on Oct 1, 2026 at 10:00 AM' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(base);
    fireEvent.click(within(manual).getByRole('button', { name: /^Actions for Writing/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('manual');
  });

  it("names a task's own rows by day, and leaves out earnings for a task with no rate", () => {
    render(
      <TimeEntryRows
        entries={[base]}
        tasks={tasks}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        showTask={false}
        showEarnings={false}
        label="Time entries"
      />
    );
    const [row] = rowsOf('Time entries');
    expect(row).toHaveTextContent(/^Oct 1, 202610:00 AM – 11:00 AM1h 0m$/);
  });
});

describe('TimeEntriesTable on a phone', () => {
  it('lists the entries as rows, sorted from a menu instead of the headers', () => {
    setPhoneViewport();
    const onSort = vi.fn();
    const { rerender } = render(
      <TimeEntriesTable
        entries={[base]}
        tasks={tasks}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        sortField="startTime"
        sortDirection="desc"
        onSort={onSort}
      />
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(rowsOf('Time entries')).toHaveLength(1);
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    expect(sort).toHaveTextContent('Newest first');

    fireEvent.mouseDown(sort);
    fireEvent.click(screen.getByRole('option', { name: 'Most earned first' }));
    expect(onSort).toHaveBeenCalledWith('earnings', 'desc');

    // A desktop's column sort a phone has no item for
    rerender(
      <TimeEntriesTable
        entries={[base]}
        tasks={tasks}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        sortField="endTime"
        sortDirection="asc"
        onSort={onSort}
      />
    );
    expect(screen.getByRole('combobox', { name: 'Sort by' })).not.toHaveTextContent(/first|A to Z/);
  });
});

describe('GoalAchievementsTable on a phone', () => {
  const day = (date: string, status: DailyGoalAchievement['status'], difference: number): DailyGoalAchievement => ({
    id: `${date}-${status}`,
    date,
    goalAmount: 100,
    earnedAmount: 100 + difference,
    currency: 'USD',
    percentageAchieved: 100 + difference,
    status,
    difference,
    recordedAt: '2026-01-01T00:00:00Z',
  });

  it('lists each day newest first with what it earned, its share of the goal, status and difference', () => {
    setPhoneViewport();
    render(
      <GoalAchievementsTable
        achievements={[
          day('2026-01-01', 'missed', -40),
          day('2026-01-03', 'exceeded', 25),
          day('2026-01-02', 'hit', 0),
        ]}
      />
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const [exceeded, hit, missed] = rowsOf('Daily goal');
    expect(exceeded).toHaveTextContent('Sat, Jan 3$125.00125% of $100.00Exceeded+$25.00');
    expect(hit).toHaveTextContent('Fri, Jan 2$100.00100% of $100.00Hit');
    expect(missed).toHaveTextContent('Thu, Jan 1$60.0060% of $100.00Missed$40.00');
  });
});
