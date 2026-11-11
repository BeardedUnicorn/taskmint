import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { StartWorkDialog } from '../StartWorkDialog';
import { Task } from '../../../../types/task';

const task = (id: string, name: string, overrides: Partial<Task> = {}): Task => ({
  id,
  name,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const tasks = [
  task('t1', 'Annotation', { hourlyRate: 40 }),
  task('t2', 'Review', { isFavorite: true }),
  task('t3', 'Old project', { isArchived: true }),
];

describe('StartWorkDialog', () => {
  const onStart = vi.fn();
  const onClose = vi.fn();
  const onAddTask = vi.fn();

  beforeEach(() => {
    onStart.mockResolvedValue({ outcome: 'started' });
  });

  const renderDialog = (dialogTasks: Task[] = tasks) =>
    render(
      <StartWorkDialog onClose={onClose} tasks={dialogTasks} sessions={[]} onStart={onStart} onAddTask={onAddTask} />
    );

  const taskField = () => screen.getByRole('combobox', { name: /^Task/ });

  // A plain dropdown, focused on open
  it('lists active tasks only, favorites first, with their rates', () => {
    renderDialog();
    expect(taskField()).toHaveFocus();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.mouseDown(taskField());
    const options = screen.getAllByRole('option').map(option => option.textContent);

    expect(options).toEqual(['★Review', 'Annotation$40.00/hr']);
  });

  it('keeps Start disabled until a task is picked, then starts it', async () => {
    renderDialog();
    const startButton = screen.getByRole('button', { name: 'Start' });
    expect(startButton).toBeDisabled();

    fireEvent.mouseDown(taskField());
    fireEvent.click(screen.getByRole('option', { name: /Annotation/ }));
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    await waitFor(() => expect(onStart).toHaveBeenCalledWith('t1', 'Annotation'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('will not start a picked task that was archived meanwhile', () => {
    const { rerender } = renderDialog();
    fireEvent.mouseDown(taskField());
    fireEvent.click(screen.getByRole('option', { name: /Annotation/ }));
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();

    const archived = tasks.map(t => (t.id === 't1' ? { ...t, isArchived: true } : t));
    rerender(
      <StartWorkDialog onClose={onClose} tasks={archived} sessions={[]} onStart={onStart} onAddTask={onAddTask} />
    );

    expect(taskField()).not.toHaveTextContent(/\w/);
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('sends you to the Tasks page when there is nothing to start', () => {
    renderDialog([task('t3', 'Old project', { isArchived: true })]);

    expect(screen.getByText(/Add a task on the Tasks page first/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Tasks' }));

    expect(onAddTask).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
