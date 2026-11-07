/**
 * TimeEntriesTable: the Source column, and imported entries being read-only
 * (every work-log import rebuilds those days, so an edit would vanish).
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SortField, TimeEntriesTable, sortTimeEntries } from '../TimeEntriesTable';
import { TimeEntry } from '../../../../types/timer';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';

const base: TimeEntry = {
  id: 'tracked',
  taskId: 'task-1',
  taskName: 'Writing',
  startTime: new Date('2026-10-01T10:00:00Z'),
  endTime: new Date('2026-10-01T11:00:00Z'),
  duration: 3_600_000,
  isRunning: false,
  date: '2026-10-01',
};

const entries: TimeEntry[] = [
  base,
  { ...base, id: 'manual', source: 'manual' },
  { ...base, id: 'imported', source: 'worklog-import' },
];

const tasks = [createMockTask({ id: 'task-1', name: 'Writing', hourlyRate: 30 })];

describe('TimeEntriesTable', () => {
  const renderTable = (shown: TimeEntry[] = entries, onSort = vi.fn()) => {
    render(
      <TimeEntriesTable
        entries={shown}
        tasks={tasks}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        sortField="duration"
        sortDirection="asc"
        onSort={onSort}
      />
    );
    return onSort;
  };

  it('labels each entry with where it came from', () => {
    renderTable();

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Tracked')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Manual')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Imported')).toBeInTheDocument();
  });

  it('locks imported entries instead of offering edit and delete', () => {
    renderTable();

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getAllByRole('button')).toHaveLength(2);
    expect(within(rows[2]).queryAllByRole('button')).toHaveLength(0);
    expect(within(rows[2]).getByLabelText('Imported entries are read-only')).toBeInTheDocument();
  });

  it('sorts by a new column ascending first, and the sorted one the other way', () => {
    const onSort = renderTable();

    fireEvent.click(screen.getByText('Task'));
    fireEvent.click(screen.getByText('Duration'));
    expect(onSort.mock.calls).toEqual([
      ['taskName', 'asc'],
      ['duration', 'desc'],
    ]);
  });

  it('edits and deletes an entry', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <TimeEntriesTable
        entries={[base]}
        tasks={tasks}
        onEdit={onEdit}
        onDelete={onDelete}
        sortField="startTime"
        sortDirection="desc"
        onSort={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onEdit).toHaveBeenCalledWith(base);
    expect(onDelete).toHaveBeenCalledWith('tracked');
  });

  it('shows a running entry as running, with no duration yet', () => {
    renderTable([{ ...base, endTime: undefined, duration: undefined, isRunning: true }]);

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('sortTimeEntries', () => {
  const at = (iso: string) => new Date(iso);
  const early: TimeEntry = {
    ...base,
    id: 'early',
    taskName: 'alpha',
    startTime: at('2026-10-01T08:00:00Z'),
    endTime: at('2026-10-01T08:30:00Z'),
    duration: 1_800_000,
    source: 'manual',
  };
  const late: TimeEntry = {
    ...base,
    id: 'late',
    taskName: 'Beta',
    startTime: at('2026-10-03T09:00:00Z'),
    endTime: undefined,
    duration: undefined,
    isRunning: true,
  };

  it.each<[SortField, string[]]>([
    ['taskName', ['early', 'late']],
    ['startTime', ['early', 'late']],
    ['date', ['early', 'late']],
    ['endTime', ['late', 'early']],
    ['duration', ['late', 'early']],
    ['earnings', ['late', 'early']],
    ['source', ['early', 'late']],
  ])('sorts by %s, either way', (field, ascending) => {
    expect(sortTimeEntries([late, early], tasks, field, 'asc').map(entry => entry.id)).toEqual(ascending);
    expect(sortTimeEntries([early, late], tasks, field, 'desc').map(entry => entry.id)).toEqual(
      [...ascending].reverse()
    );
  });

  it('keeps ties in their order', () => {
    expect(sortTimeEntries([early, { ...early, id: 'twin' }], tasks, 'taskName', 'asc').map(entry => entry.id)).toEqual(
      ['early', 'twin']
    );
  });
});
