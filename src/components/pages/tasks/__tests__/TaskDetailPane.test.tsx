import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect } from 'vitest';
import { TaskDetailPane } from '../TaskDetailPane';
import { Task } from '../../../../types/task';

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
