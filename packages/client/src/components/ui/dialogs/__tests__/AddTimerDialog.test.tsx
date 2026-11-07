import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AddTimerDialog } from '../AddTimerDialog';
import { Task } from '../../../../types/task';
import { TaskSession, TimerState } from '../../../../types/timer';
import { createMockTask, createMockTaskSession, createMockTimerInstance } from '../../../../__tests__/setup/session-test-utils';

const tasks: Task[] = [
  createMockTask({ id: 't1', name: 'Annotation' }),
  createMockTask({ id: 't2', name: 'Review', isFavorite: true }),
  createMockTask({ id: 't3', name: 'Old project', isArchived: true }),
];

const session = (overrides: Partial<TaskSession> = {}): TaskSession =>
  createMockTaskSession({ id: 's-1', taskId: 't1', taskName: 'Annotation', isActive: true, ...overrides });

describe('AddTimerDialog', () => {
  const onAdd = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onAdd.mockResolvedValue(null);
  });

  const renderDialog = (dialogSession = session()) =>
    render(
      <AddTimerDialog session={dialogSession} tasks={tasks} sessions={[dialogSession]} onClose={onClose} onAdd={onAdd} />
    );
  const taskField = () => screen.getByLabelText('Task');
  const addButton = () => screen.getByRole('button', { name: 'Add Timer' });

  it("starts from the session's own task before it has timers", () => {
    renderDialog();
    expect(taskField()).toHaveValue('Annotation');
  });

  it("starts from the task of the session's newest timer", () => {
    const latest = createMockTimerInstance({
      id: 'i-2',
      state: TimerState.stopped,
      task: { taskId: 't2', taskName: 'Review', hourlyRate: null },
    });
    renderDialog(session({ timerInstances: [createMockTimerInstance({ id: 'i-1' }), latest] }));
    expect(taskField()).toHaveValue('★ Review');
  });

  it('starts empty when the latest task has been archived', () => {
    renderDialog(session({ taskId: 't3', taskName: 'Old project' }));

    expect(taskField()).toHaveValue('');
    expect(addButton()).toBeDisabled();
  });

  it('lists active tasks only, favorites first', async () => {
    renderDialog();

    fireEvent.mouseDown(taskField());

    const options = (await screen.findAllByRole('option')).map(option => option.textContent);
    expect(options).toEqual(['★ Review', 'Annotation']);
  });

  it('adds the task picked, then closes', async () => {
    renderDialog();

    fireEvent.mouseDown(taskField());
    fireEvent.click(await screen.findByRole('option', { name: '★ Review' }));
    fireEvent.click(addButton());

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('adds on Enter', async () => {
    renderDialog();

    fireEvent.submit(addButton().closest('form')!);

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' })));
  });

  it('does nothing on Enter with no task picked', () => {
    renderDialog(session({ taskId: 't3', taskName: 'Old project' }));

    fireEvent.submit(addButton().closest('form')!);

    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without adding on Cancel', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
