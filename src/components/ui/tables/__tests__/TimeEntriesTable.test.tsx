/**
 * TimeEntriesTable: the Source column, and imported entries being read-only
 * (every work-log import rebuilds those days, so an edit would vanish).
 */

import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TimeEntriesTable } from '../TimeEntriesTable';
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

describe('TimeEntriesTable', () => {
  const renderTable = () =>
    render(
      <TimeEntriesTable
        entries={entries}
        tasks={[createMockTask({ id: 'task-1', name: 'Writing', hourlyRate: 30 })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

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
});
