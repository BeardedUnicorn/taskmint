/**
 * The History filters: what each control changes, what counts as a filter,
 * and which entries a set of filters keeps.
 */

import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import dayjs from 'dayjs';
import {
  TimeEntriesFilters,
  TimeEntriesFiltersState,
  applyTimeEntriesFilters,
  defaultFilters,
  hydrateTimeEntriesFilters,
} from '../TimeEntriesFilters';
import { TimeEntry } from '../../../../types/timer';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';

const annotation = createMockTask({ id: 'task-1', name: 'Annotation' });
const review = createMockTask({ id: 'task-2', name: 'Review' });

/** The filters under a page that keeps each change, as History does. */
function renderFilters(initial: Partial<TimeEntriesFiltersState> = {}) {
  const changes = vi.fn();
  const onClearFilters = vi.fn();
  function Page() {
    const [filters, setFilters] = useState<TimeEntriesFiltersState>({
      ...defaultFilters,
      datePreset: 'last7',
      ...initial,
    });
    const [expanded, setExpanded] = useState(false);
    return (
      <TimeEntriesFilters
        filters={filters}
        tasks={[annotation, review]}
        onFiltersChange={next => {
          changes(next);
          setFilters(next);
        }}
        onClearFilters={onClearFilters}
        isExpanded={expanded}
        onToggleExpanded={() => setExpanded(open => !open)}
        defaultDatePreset="last7"
      />
    );
  }
  render(<Page />);
  const latest = (): TimeEntriesFiltersState => changes.mock.calls.at(-1)![0];
  return { latest, onClearFilters };
}

describe('TimeEntriesFilters', () => {
  it('counts each filter set, and offers to clear them', () => {
    const { latest, onClearFilters } = renderFilters();
    expect(screen.queryByText(/active$/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'ann' } });
    expect(latest().searchQuery).toBe('ann');
    expect(screen.getByText('1 active')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('sets a quick range', async () => {
    const { latest } = renderFilters();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Range' }));
    fireEvent.click(await screen.findByRole('option', { name: 'This month' }));
    expect(latest().datePreset).toBe('thisMonth');
    expect(latest().startDate?.format('YYYY-MM-DD')).toBe(dayjs().startOf('month').format('YYYY-MM-DD'));
  });

  it('filters by status and by task', async () => {
    const { latest } = renderFilters();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Running' }));
    expect(latest().status).toBe('running');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Filter by tasks' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Review' }));
    expect(latest().selectedTasks).toEqual([review]);
    expect(screen.getByText('2 active')).toBeInTheDocument();
  });

  it('sets duration limits in whole minutes, a cleared one being none', () => {
    const { latest } = renderFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Expand filters' }));

    fireEvent.change(screen.getByLabelText('Min Duration (minutes)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Max Duration (minutes)'), { target: { value: '90' } });
    expect(latest()).toMatchObject({ minDuration: 0, maxDuration: 90 });
    // A limit of 0 still shows
    expect(screen.getByLabelText('Min Duration (minutes)')).toHaveValue(0);

    fireEvent.change(screen.getByLabelText('Min Duration (minutes)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Max Duration (minutes)'), { target: { value: '' } });
    expect(latest()).toMatchObject({ minDuration: null, maxDuration: null });
  });

  it('takes dates picked by hand as a custom range', async () => {
    const start = dayjs().startOf('month');
    const { latest } = renderFilters({ startDate: start, endDate: start.endOf('month'), datePreset: null });
    fireEvent.click(screen.getByRole('button', { name: 'Expand filters' }));

    for (const [index, dayNumber] of [
      [0, '2'],
      [1, '20'],
    ] as const) {
      fireEvent.click((await screen.findAllByRole('button', { name: /Choose date/ }))[index]);
      fireEvent.click(within(await screen.findByRole('grid')).getByRole('gridcell', { name: dayNumber }));
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    }

    expect(latest().datePreset).toBeNull();
    expect(latest().startDate?.date()).toBe(2);
    expect(latest().endDate?.date()).toBe(20);
  });
});

describe('applyTimeEntriesFilters', () => {
  const entry = (overrides: Partial<TimeEntry>): TimeEntry => ({
    id: 'e',
    taskId: 'task-1',
    taskName: 'Annotation',
    startTime: new Date(2026, 9, 10, 9),
    endTime: new Date(2026, 9, 10, 10),
    duration: 60 * 60_000,
    isRunning: false,
    date: '2026-10-10',
    ...overrides,
  });
  const keeps = (filters: Partial<TimeEntriesFiltersState>, entries: TimeEntry[]) =>
    applyTimeEntriesFilters(entries, { ...defaultFilters, ...filters }).map(kept => kept.id);

  const hour = entry({ id: 'hour' });
  const quarter = entry({ id: 'quarter', taskId: undefined, taskName: 'Review', duration: 15 * 60_000 });
  const running = entry({ id: 'running', duration: undefined, endTime: undefined, isRunning: true });

  it('keeps everything without filters', () => {
    expect(keeps({}, [hour, quarter, running])).toEqual(['hour', 'quarter', 'running']);
  });

  it('matches the search in the task name, any case', () => {
    expect(keeps({ searchQuery: 'REV' }, [hour, quarter])).toEqual(['quarter']);
  });

  it('matches chosen tasks by id, or by name for entries without one', () => {
    expect(keeps({ selectedTasks: [annotation] }, [hour, quarter])).toEqual(['hour']);
    expect(keeps({ selectedTasks: [review] }, [hour, quarter])).toEqual(['quarter']);
  });

  it('keeps the days in the range, whole days', () => {
    const before = entry({ id: 'before', startTime: new Date(2026, 9, 9, 23) });
    const after = entry({ id: 'after', startTime: new Date(2026, 9, 12, 0, 30) });
    const range = { startDate: dayjs(new Date(2026, 9, 10)), endDate: dayjs(new Date(2026, 9, 11)) };
    expect(keeps(range, [before, hour, after])).toEqual(['hour']);
  });

  it('keeps durations within the limits; a running entry has none to judge', () => {
    expect(keeps({ minDuration: 30 }, [hour, quarter, running])).toEqual(['hour', 'running']);
    expect(keeps({ maxDuration: 30 }, [hour, quarter, running])).toEqual(['quarter', 'running']);
  });

  it('keeps finished or running entries by status', () => {
    expect(keeps({ status: 'completed' }, [hour, running])).toEqual(['hour']);
    expect(keeps({ status: 'running' }, [hour, running])).toEqual(['running']);
  });
});

describe('hydrateTimeEntriesFilters, with nothing usable saved', () => {
  it('starts from the defaults', () => {
    expect(hydrateTimeEntriesFilters(null, [annotation])).toMatchObject({ ...defaultFilters, datePreset: null });
  });

  it('drops a saved task list that is not a list', () => {
    expect(hydrateTimeEntriesFilters({ selectedTasks: 'task-1' as never }, [annotation]).selectedTasks).toEqual([]);
  });
});
