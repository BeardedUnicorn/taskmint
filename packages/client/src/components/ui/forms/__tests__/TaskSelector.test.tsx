import { useState } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  let setTasks: (next: Task[]) => void = () => {};
  function Parent() {
    const [value, setValue] = useState('');
    const [predefinedTasks, setPredefinedTasks] = useState(tasks);
    setTasks = setPredefinedTasks;
    return (
      <TaskSelector
        value={value}
        onChange={task => {
          changes(task);
          setValue(task.id);
        }}
        predefinedTasks={predefinedTasks}
        onCreateNewTask={onCreateNewTask}
      />
    );
  }
  render(<Parent />);
  return { changes, onCreateNewTask, setTasks: (next: Task[]) => act(() => setTasks(next)) };
}

// Named by its label, then the task it shows
const field = () => screen.getByRole('combobox', { name: /^Task/ });

describe('TaskSelector', () => {
  it('lists tasks by name, with a rate only where there is one', () => {
    renderSelector();
    fireEvent.mouseDown(field());

    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Annotation$40.00/hr', 'Zebra']);
  });

  it('picks a task from the list, with nothing to type', () => {
    const { changes } = renderSelector();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.mouseDown(field());
    fireEvent.click(screen.getByRole('option', { name: /Annotation/ }));

    expect(changes).toHaveBeenLastCalledWith(tasks[1]);
    expect(field()).toHaveTextContent('Annotation');
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
    await waitFor(() =>
      expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'new', name: 'Review' }))
    );
    // Picked straight away, before the caller's tasks include it
    expect(field()).toHaveTextContent('Review');

    fireEvent.click(screen.getByRole('button', { name: 'Create New Task' }));
    fireEvent.change(screen.getByLabelText('New Task Name'), { target: { value: 'Calls' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(onCreateNewTask).toHaveBeenCalledWith('Calls'));
  });

  it("lists a created task once, when the caller's tasks catch up", async () => {
    const { setTasks } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: 'Create New Task' }));
    fireEvent.change(screen.getByLabelText('New Task Name'), { target: { value: 'Review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(field()).toHaveTextContent('Review'));

    setTasks([...tasks, createMockTask({ id: 'new', name: 'Review' })]);
    fireEvent.mouseDown(field());

    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual(['Annotation$40.00/hr', 'Review', 'Zebra']);
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
