/**
 * Unit Tests for EditTimeEntryDialog
 *
 * The dialog edits a time entry's task name and tracked duration (hours +
 * minutes); the start time is display-only. Includes a regression test for
 * the old lockout bug where a failed submit permanently disabled Save.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { EditTimeEntryDialog } from '../EditTimeEntryDialog';
import { EditTimeEntryData } from '../../../../types/form';

const HOUR = 3_600_000;
const MINUTE = 60_000;

// 1h 35m 42s — the 42s remainder must survive a name-only edit.
const entry: EditTimeEntryData = {
  id: 'instance-1',
  taskName: 'Deep work',
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
      />
    );

  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  it('prefills hours and minutes from the entry duration', () => {
    renderDialog();

    expect(screen.getByLabelText('Task Name')).toHaveValue('Deep work');
    expect(screen.getByLabelText('Hours')).toHaveValue(1);
    expect(screen.getByLabelText('Minutes')).toHaveValue(35);
  });

  it('preserves the sub-minute remainder on a name-only edit', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Task Name'), {
      target: { value: 'Deeper work' },
    });
    save();

    expect(onSave).toHaveBeenCalledWith({
      id: 'instance-1',
      taskName: 'Deeper work',
      durationMs: entry.durationMs, // untouched, 42s remainder intact
    });
  });

  it('sends exact whole minutes when the duration is edited', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '5' } });
    save();

    expect(onSave).toHaveBeenCalledWith({
      id: 'instance-1',
      taskName: 'Deep work',
      durationMs: 2 * HOUR + 5 * MINUTE,
    });
  });

  it('rejects an empty task name, then recovers once fixed (lockout regression)', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Task Name'), { target: { value: '' } });
    save();

    expect(screen.getByText('Task name is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    // Fixing the field clears the error, and Save still works — the old
    // dialog disabled Save permanently after one failed submit.
    fireEvent.change(screen.getByLabelText('Task Name'), {
      target: { value: 'Deep work' },
    });
    expect(screen.queryByText('Task name is required')).not.toBeInTheDocument();

    save();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('rejects minutes outside 0-59', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '60' } });
    save();

    expect(
      screen.getByText('Minutes must be a whole number between 0 and 59')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
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
