import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect } from 'vitest';
import { TaskDetailPane } from '../TaskDetailPane';
import { Task } from '../../../../types/task';
import { TimeEntry } from '../../../../types/timer';

const task: Task = {
  id: 'task-1',
  name: 'Annotation',
  hourlyRate: 40,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** The pane's handlers, none of them under test */
const base = {
  onEditEntry: () => {},
  onDeleteEntry: () => {},
  onToggleFavorite: () => {},
  onStart: () => {},
  isRunning: false,
  onViewHistory: () => {},
};

const renderPane = (paneTask: Task, onToggleFavorite: (taskId: string) => void) =>
  render(<TaskDetailPane {...base} task={paneTask} timeEntries={[]} onToggleFavorite={onToggleFavorite} />);

describe('TaskDetailPane favorite star', () => {
  it("reflects the task's own favorite flag and toggles it", () => {
    const onToggleFavorite = vi.fn();
    renderPane(task, onToggleFavorite);

    const star = screen.getByRole('button', { name: 'Add to favorites' });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(star);

    expect(onToggleFavorite).toHaveBeenCalledWith('task-1');
  });

  it('shows a starred task as a favorite', () => {
    renderPane({ ...task, isFavorite: true }, vi.fn());

    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TaskDetailPane earnings', () => {
  const entry = (id: string, hourlyRate: number | null): TimeEntry => ({
    id,
    taskId: 'task-1',
    taskName: 'Annotation',
    startTime: new Date(2026, 9, 10, 9, 0),
    endTime: new Date(2026, 9, 10, 10, 0),
    duration: 3_600_000,
    isRunning: false,
    date: '2026-10-10',
    hourlyRate,
  });

  it('keeps time at the rate it was tracked at after the task rate changes', () => {
    // An hour each, tracked at $40 and $45; the task now pays $90
    render(
      <TaskDetailPane
        {...base}
        task={{ ...task, hourlyRate: 90 }}
        timeEntries={[entry('a', 40), entry('b', 45)]}
        onEditEntry={() => {}}
        onDeleteEntry={() => {}}
      />
    );

    expect(screen.getByText('Total Earnings: $85.00')).toBeInTheDocument();
    expect(screen.getByText('$40.00')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  it('uses the current task rate for time without one of its own', () => {
    render(
      <TaskDetailPane
        {...base}
        task={{ ...task, hourlyRate: 90 }}
        timeEntries={[entry('a', null)]}
        onEditEntry={() => {}}
        onDeleteEntry={() => {}}
      />
    );

    expect(screen.getByText('Total Earnings: $90.00')).toBeInTheDocument();
  });
});

describe('TaskDetailPane start and history', () => {
  const entries = (count: number): TimeEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `e${i}`,
      taskId: 'task-1',
      taskName: 'Annotation',
      startTime: new Date(2026, 9, 1 + i, 9, 0),
      endTime: new Date(2026, 9, 1 + i, 10, 0),
      duration: 3_600_000,
      isRunning: false,
      date: `2026-10-${String(1 + i).padStart(2, '0')}`,
    }));

  it('starts the task, and says when it is already running', () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <TaskDetailPane
        {...base}
        task={task}
        timeEntries={[]}
        onEditEntry={() => {}}
        onDeleteEntry={() => {}}
        onStart={onStart}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledWith(task);

    rerender(
      <TaskDetailPane
        {...base}
        task={task}
        timeEntries={[]}
        onEditEntry={() => {}}
        onDeleteEntry={() => {}}
        onStart={onStart}
        isRunning
      />
    );
    expect(screen.getByRole('button', { name: 'Running' })).toBeDisabled();
  });

  it('offers no Start for an archived task', () => {
    render(
      <TaskDetailPane
        {...base}
        task={{ ...task, isArchived: true }}
        timeEntries={[]}
        onEditEntry={() => {}}
        onDeleteEntry={() => {}}
        onStart={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('lists the newest 10 entries and opens History for the rest', () => {
    const onViewHistory = vi.fn();
    render(
      <TaskDetailPane
        {...base}
        task={task}
        timeEntries={entries(12)}
        onEditEntry={() => {}}
        onDeleteEntry={() => {}}
        onViewHistory={onViewHistory}
      />
    );

    expect(screen.getAllByRole('row')).toHaveLength(11); // header + 10
    expect(screen.getByText('The newest 10 of 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View all in History (12)' }));
    expect(onViewHistory).toHaveBeenCalledWith(task);
  });
});

describe('TaskDetailPane entries', () => {
  const finished = (overrides: Partial<TimeEntry>): TimeEntry => ({
    id: 'e1',
    taskId: 'task-1',
    taskName: 'Annotation',
    startTime: new Date(2026, 9, 10, 9, 0),
    endTime: new Date(2026, 9, 10, 10, 0),
    duration: 3_600_000,
    isRunning: false,
    date: '2026-10-10',
    ...overrides,
  });

  it("lists entries by the task's id, or by its name for older ones, and edits or deletes them", () => {
    const onEditEntry = vi.fn();
    const onDeleteEntry = vi.fn();
    const byName = finished({ id: 'old', taskId: undefined });
    render(
      <TaskDetailPane
        {...base}
        task={task}
        timeEntries={[finished({}), byName, finished({ id: 'other', taskId: 'task-2', taskName: 'Other' })]}
        onEditEntry={onEditEntry}
        onDeleteEntry={onDeleteEntry}
      />
    );

    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Entry' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Entry' })[1]);
    expect(onEditEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    expect(onDeleteEntry).toHaveBeenCalledWith('old');
  });

  it('locks imported entries, and says when the task has no rate', () => {
    render(
      <TaskDetailPane
        {...base}
        task={{ ...task, hourlyRate: undefined }}
        timeEntries={[finished({ source: 'worklog-import' })]}
      />
    );

    expect(screen.getByLabelText('Imported entries are read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Entry' })).not.toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });
});
