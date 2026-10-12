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

const renderPane = (paneTask: Task, onToggleFavorite?: (taskId: string) => void) =>
  render(
    <TaskDetailPane
      task={paneTask}
      timeEntries={[]}
      onEditEntry={() => {}}
      onDeleteEntry={() => {}}
      onToggleFavorite={onToggleFavorite}
    />
  );

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

    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('has no star without a toggle handler', () => {
    renderPane(task);
    expect(screen.queryByRole('button', { name: /favorites/ })).not.toBeInTheDocument();
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
        task={{ ...task, hourlyRate: 90 }}
        timeEntries={[entry('a', null)]}
        onEditEntry={() => {}}
        onDeleteEntry={() => {}}
      />
    );

    expect(screen.getByText('Total Earnings: $90.00')).toBeInTheDocument();
  });
});

