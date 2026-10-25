import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { defaultFilters, hydrateTimeEntriesFilters } from '../TimeEntriesFilters';
import { Task } from '../../../../types/task';

const tasks: Task[] = [
  { id: 'task-1', name: 'Annotation (renamed)', createdAt: '', updatedAt: '' },
];
const today = dayjs(new Date(2026, 9, 15, 12));

describe('hydrateTimeEntriesFilters', () => {
  it('turns saved text dates back into dates', () => {
    const filters = hydrateTimeEntriesFilters(
      { ...defaultFilters, startDate: '2026-10-01T07:00:00.000Z', endDate: 'not a date' } as never,
      tasks,
      today
    );
    expect(dayjs.isDayjs(filters.startDate)).toBe(true);
    expect(filters.startDate!.isSame(dayjs('2026-10-01T07:00:00.000Z'))).toBe(true);
    expect(filters.endDate).toBeNull();
  });

  it('recomputes a saved quick range from today', () => {
    const filters = hydrateTimeEntriesFilters(
      { ...defaultFilters, datePreset: 'thisMonth', startDate: '2026-08-01', endDate: '2026-08-31' } as never,
      tasks,
      today
    );
    expect(filters.startDate!.format('YYYY-MM-DD')).toBe('2026-10-01');
    expect(filters.endDate!.format('YYYY-MM-DD')).toBe('2026-10-31');
    expect(filters.datePreset).toBe('thisMonth');
  });

  it('swaps saved task copies for the current tasks, dropping deleted ones', () => {
    const filters = hydrateTimeEntriesFilters(
      {
        ...defaultFilters,
        selectedTasks: [
          { id: 'task-1', name: 'Annotation' },
          { id: 'deleted', name: 'Gone' },
        ],
      } as never,
      tasks,
      today
    );
    expect(filters.selectedTasks).toEqual([tasks[0]]);
  });

  it('fills in anything missing from older saved filters', () => {
    expect(hydrateTimeEntriesFilters({ searchQuery: 'x' } as never, tasks, today)).toMatchObject({
      searchQuery: 'x',
      status: 'all',
      minDuration: null,
      startDate: null,
      datePreset: null,
    });
  });
});
