import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TaskSelector } from '../TaskSelector';
import { Task } from '../../../../types/task';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';

const tasks = [
  createMockTask({ id: 'z', name: 'Zebra', hourlyRate: 0 }),
  createMockTask({ id: 'a', name: 'Annotation', hourlyRate: 40 }),
];

/** The selector under a parent that keeps the choice, as the import dialog does. */
function renderSelector(onCreateNewTask = vi.fn(async (name: string) => createMockTask({ id: 'new', name }))) {
  const changes = vi.fn();
  function Parent() {
    const [value, setValue] = useState('');
    return (
      <TaskSelector
        value={value}
        onChange={(name, task) => {
          changes(name, task);
          setValue(name);
        }}
        predefinedTasks={tasks}
        onCreateNewTask={onCreateNewTask}
        placeholder="Pick a task"
      />
    );
  }
  render(<Parent />);
  return { changes, onCreateNewTask };
}

const field = () => screen.getByRole('combobox', { name: 'Task' });

describe('TaskSelector', () => {
  it('lists tasks by name, with a rate only where there is one', () => {
    renderSelector();
    fireEvent.mouseDown(field());

    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Annotation$40/hour', 'Zebra']);
  });

  it('picks a task, takes a typed name, and clears', async () => {
    const { changes } = renderSelector();

    fireEvent.mouseDown(field());
    fireEvent.click(screen.getByRole('option', { name: /Annotation/ }));
    expect(changes).toHaveBeenLastCalledWith('Annotation', tasks[1]);

    await userEvent.clear(field());
    await userEvent.type(field(), 'Brand new{Enter}');
    expect(changes).toHaveBeenLastCalledWith('Brand new', undefined);

    // (Shown on hover)
    fireEvent.click(screen.getByTitle('Clear'));
    expect(changes).toHaveBeenLastCalledWith('', undefined);
  });

  it('picks a task whose exact name is typed', () => {
    const { changes } = renderSelector();
    fireEvent.change(field(), { target: { value: 'Zebra' } });
    expect(changes).toHaveBeenLastCalledWith('Zebra', tasks[0]);
  });

  it('creates a task from a name, on Enter or the button', async () => {
    const { changes, onCreateNewTask } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: 'Create New Task' }));
    const name = screen.getByLabelText('New Task Name');

    // Nothing to create yet
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onCreateNewTask).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Task' })).toBeDisabled();

    fireEvent.change(name, { target: { value: '  Review  ' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(changes).toHaveBeenLastCalledWith('Review', expect.objectContaining({ id: 'new' })));
    expect(field()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create New Task' }));
    fireEvent.change(screen.getByLabelText('New Task Name'), { target: { value: 'Calls' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(onCreateNewTask).toHaveBeenCalledWith('Calls'));
  });

  it('keeps the name for another try when creating fails, and cancels with Escape or Cancel', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { onCreateNewTask } = renderSelector(vi.fn(async (): Promise<Task> => Promise.reject(new Error('taken'))));
    fireEvent.click(screen.getByRole('button', { name: 'Create New Task' }));
    fireEvent.change(screen.getByLabelText('New Task Name'), { target: { value: 'Review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(onCreateNewTask).toHaveBeenCalled());
    expect(screen.getByLabelText('New Task Name')).toHaveValue('Review');

    fireEvent.keyDown(screen.getByLabelText('New Task Name'), { key: 'Escape' });
    expect(field()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create New Task' }));
    expect(screen.getByLabelText('New Task Name')).toHaveValue('');
    fireEvent.keyDown(screen.getByLabelText('New Task Name'), { key: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(field()).toBeInTheDocument();
    error.mockRestore();
  });
});
