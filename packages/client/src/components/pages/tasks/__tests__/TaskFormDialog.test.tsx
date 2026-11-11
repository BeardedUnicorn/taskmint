import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TaskFormDialog } from '../TaskFormDialog';
import { Task } from '../../../../types/task';

const templates = vi.hoisted(() => ({ active: [] as { id: string; name: string }[], isLoading: false }));
vi.mock('../../../../hooks/useNoteTemplates', () => ({
  useNoteTemplates: () => ({
    getActiveTemplates: () => templates.active,
    isLoading: templates.isLoading,
  }),
}));

describe('TaskFormDialog', () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue({ id: '1', name: 'Test', createdAt: '', updatedAt: '' } as Task);

  beforeEach(() => {
    templates.active = [];
    templates.isLoading = false;
  });

  it('shows validation error when required fields are missing', async () => {
    render(<TaskFormDialog open={true} onClose={onClose} mode="add" initialTask={null} onSubmit={onSubmit} />);

    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Task name is required')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid data in add mode', async () => {
    render(<TaskFormDialog open={true} onClose={onClose} mode="add" initialTask={null} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Enter task name...'), { target: { value: ' New Task ' } });
    fireEvent.change(screen.getByLabelText('Hourly Rate'), { target: { value: '25' } });

    fireEvent.click(screen.getByText('Add Task'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'New Task',
        hourlyRate: 25,
        defaultNoteTemplateId: null,
      });
    });
  });

  it('submits once even when Add Task is clicked twice', async () => {
    let finish!: (task: Task) => void;
    const slowSubmit = vi.fn(() => new Promise<Task>(resolve => (finish = resolve)));
    render(<TaskFormDialog open onClose={onClose} mode="add" initialTask={null} onSubmit={slowSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Enter task name...'), { target: { value: 'New Task' } });
    fireEvent.click(screen.getByText('Add Task'));
    fireEvent.click(screen.getByText('Add Task'));

    expect(slowSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Add Task' })).toBeDisabled();
    finish({ id: '1', name: 'New Task', createdAt: '', updatedAt: '' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a taken name next to the name field', async () => {
    const failing = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('A task with the name "Design" already exists'), { code: 'TASK_DUPLICATE_NAME' })
      );
    render(<TaskFormDialog open onClose={onClose} mode="add" initialTask={null} onSubmit={failing} />);

    fireEvent.change(screen.getByPlaceholderText('Enter task name...'), { target: { value: 'Design' } });
    fireEvent.click(screen.getByText('Add Task'));

    expect(await screen.findByText('A task with the name "Design" already exists')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explains that a changed rate applies to new time only', () => {
    const task: Task = { id: '1', name: 'Existing Task', hourlyRate: 10, createdAt: '', updatedAt: '' };
    render(<TaskFormDialog open={true} onClose={onClose} mode="edit" initialTask={task} onSubmit={onSubmit} />);

    expect(screen.queryByText(/Applies to time tracked from now on/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hourly Rate'), { target: { value: '12' } });
    expect(
      screen.getByText(/Applies to time tracked from now on. Time already tracked keeps the rate it was tracked at./)
    ).toBeInTheDocument();
  });

  it('has no Parent Task field', () => {
    render(<TaskFormDialog open={true} onClose={onClose} mode="add" initialTask={null} onSubmit={onSubmit} />);

    expect(screen.queryByLabelText('Parent Task')).not.toBeInTheDocument();
  });

  it('prefills values in edit mode', () => {
    const task: Task = {
      id: '1',
      name: 'Existing Task',
      hourlyRate: 10,
      defaultNoteTemplateId: null,
      createdAt: '',
      updatedAt: '',
    };

    render(<TaskFormDialog open={true} onClose={onClose} mode="edit" initialTask={task} onSubmit={onSubmit} />);

    expect(screen.getByDisplayValue('Existing Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  describe('checking what was typed', () => {
    const typeAndSubmit = (name: string, rate = '') => {
      fireEvent.change(screen.getByPlaceholderText('Enter task name...'), { target: { value: name } });
      fireEvent.change(screen.getByLabelText('Hourly Rate'), { target: { value: rate } });
      fireEvent.submit(document.querySelector('form')!);
    };

    it.each([
      ['a one-letter name', 'A', '', 'Task name must be at least 2 characters'],
      ['a rate that is no number', 'Design', '.', 'Hourly rate must be a positive number'],
      ['a rate over $1000 an hour', 'Design', '2000', 'Hourly rate seems too high (max $1000/hour)'],
    ])('refuses %s', async (_, name, rate, message) => {
      render(<TaskFormDialog open onClose={onClose} mode="add" initialTask={null} onSubmit={onSubmit} />);
      typeAndSubmit(name, rate);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("stays open when the save didn't go through", async () => {
      const unsaved = vi.fn().mockResolvedValue(null);
      render(<TaskFormDialog open onClose={onClose} mode="add" initialTask={null} onSubmit={unsaved} />);
      typeAndSubmit('Design');

      await waitFor(() => expect(unsaved).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
    });

    it('stays open, without a field error, when the save fails another way', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failing = vi.fn().mockRejectedValue(new Error('disk full'));
      render(<TaskFormDialog open onClose={onClose} mode="add" initialTask={null} onSubmit={failing} />);
      typeAndSubmit('Design');

      await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to submit task:', expect.any(Error)));
      expect(screen.queryByText('disk full')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe('the default note template', () => {
    it('saves the one chosen', async () => {
      templates.active = [{ id: 'standup', name: 'Standup' }];
      render(<TaskFormDialog open onClose={onClose} mode="add" initialTask={null} onSubmit={onSubmit} />);
      fireEvent.change(screen.getByPlaceholderText('Enter task name...'), { target: { value: 'Design' } });

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Default Note Template' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Standup' }));
      fireEvent.click(screen.getByText('Add Task'));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ defaultNoteTemplateId: 'standup' }))
      );
    });

    it('waits for the templates to load', () => {
      templates.isLoading = true;
      render(<TaskFormDialog open onClose={onClose} mode="add" initialTask={null} onSubmit={onSubmit} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Default Note Template' })).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('opens a task without a rate with the rate empty', () => {
    const task: Task = { id: '1', name: 'Unpaid', createdAt: '', updatedAt: '' };
    render(<TaskFormDialog open onClose={onClose} mode="edit" initialTask={task} onSubmit={onSubmit} />);
    expect(screen.getByLabelText('Hourly Rate')).toHaveValue('');
  });
});
