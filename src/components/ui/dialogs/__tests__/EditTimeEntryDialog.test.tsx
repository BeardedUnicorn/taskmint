/**
 * Unit Tests for EditTimeEntryDialog
 *
 * The dialog edits a time entry's task (a picker: another task moves the
 * entry) and tracked duration (hours + minutes); the start time is
 * display-only. Includes a regression test for the old lockout bug where a
 * failed submit permanently disabled Save.
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { EditTimeEntryDialog } from '../EditTimeEntryDialog';
import { EditTimeEntryData } from '../../../../types/form';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';

const HOUR = 3_600_000;
const MINUTE = 60_000;

const deepWork = createMockTask({ id: 'task-deep', name: 'Deep work' });
const review = createMockTask({ id: 'task-review', name: 'Review' });
const old = createMockTask({ id: 'task-old', name: 'Old project', isArchived: true });
const tasks = [deepWork, review, old];

// 1h 35m 42s — the 42s remainder must survive a task-only edit.
const entry: EditTimeEntryData = {
  id: 'instance-1',
  taskId: 'task-deep',
  durationMs: 1 * HOUR + 35 * MINUTE + 42_000,
  startTime: '2026-08-18T10:00:00.000Z',
};

describe('EditTimeEntryDialog', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDialog = (overrides: Partial<EditTimeEntryData> = {}) =>
    render(
      <EditTimeEntryDialog
        open={true}
        onClose={onClose}
        onSave={onSave}
        entry={{ ...entry, ...overrides }}
        tasks={tasks}
      />
    );

  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  const pickTask = async (name: string) => {
    await userEvent.click(screen.getByLabelText('Task'));
    await userEvent.click(within(screen.getByRole('listbox')).getByText(name));
  };

  it('prefills the task, hours and minutes from the entry', () => {
    renderDialog();

    expect(screen.getByLabelText('Task')).toHaveValue('Deep work');
    expect(screen.getByLabelText('Hours')).toHaveValue(1);
    expect(screen.getByLabelText('Minutes')).toHaveValue(35);
  });

  it('moves the entry to the picked task, keeping the sub-minute remainder', async () => {
    renderDialog();

    await pickTask('Review');
    expect(screen.getByText('Moves this entry to "Review", at its hourly rate')).toBeInTheDocument();
    save();

    expect(onSave).toHaveBeenCalledWith({
      id: 'instance-1',
      taskId: 'task-review',
      durationMs: entry.durationMs, // untouched, 42s remainder intact
    });
  });

  it('offers active tasks only, plus the entry’s own archived task', async () => {
    renderDialog({ taskId: 'task-old' });

    expect(screen.getByLabelText('Task')).toHaveValue('Old project');
    await userEvent.click(screen.getByLabelText('Task'));
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Old project', 'Deep work', 'Review']);
  });

  it('sends exact whole minutes when the duration is edited', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '5' } });
    save();

    expect(onSave).toHaveBeenCalledWith({
      id: 'instance-1',
      taskId: 'task-deep',
      durationMs: 2 * HOUR + 5 * MINUTE,
    });
  });

  it('rejects bad minutes, then recovers once fixed (lockout regression)', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '60' } });
    save();

    expect(
      screen.getByText('Minutes must be a whole number between 0 and 59')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    // Fixing the field clears the error, and Save still works — the old
    // dialog disabled Save permanently after one failed submit.
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '30' } });
    expect(
      screen.queryByText('Minutes must be a whole number between 0 and 59')
    ).not.toBeInTheDocument();

    save();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('rejects a zero total duration', () => {
    renderDialog({ durationMs: 0 });

    save();

    expect(screen.getByText('Duration must be greater than zero')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the recorded start time as reference text', () => {
    renderDialog();

    expect(screen.getByText(/the start\s+time stays as recorded/)).toBeInTheDocument();
  });
});
