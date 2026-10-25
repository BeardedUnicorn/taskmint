import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import dayjs from 'dayjs';
import {
  AddTimeDialog,
  combineDayAndTime,
  defaultStartFor,
  endsNowStart,
  validateEntryTiming,
} from '../AddTimeDialog';
import { Task } from '../../../../types/task';

const HOUR = 3_600_000;
// A fixed local "now": Oct 12 2026, 3:00 PM
const NOW = new Date(2026, 9, 12, 15, 0, 0);

describe('AddTimeDialog defaults and timing rules', () => {
  const now = dayjs(NOW);

  it('opens with an entry that ends now, even when that starts yesterday', () => {
    expect(endsNowStart(HOUR, now).format('YYYY-MM-DD HH:mm')).toBe('2026-10-12 14:00');
    const justAfterMidnight = dayjs(new Date(2026, 9, 12, 0, 30, 45));
    expect(endsNowStart(HOUR, justAfterMidnight).format('YYYY-MM-DD HH:mm')).toBe('2026-10-11 23:30');
  });

  it('ends a same-day entry now: start = now minus the duration', () => {
    const start = defaultStartFor(now, 1.5 * HOUR, now);
    expect(start.format('YYYY-MM-DD HH:mm')).toBe('2026-10-12 13:30');
  });

  it("keeps a long same-day entry on the chosen day", () => {
    const start = defaultStartFor(now, 20 * HOUR, now);
    expect(start.format('YYYY-MM-DD HH:mm')).toBe('2026-10-12 00:00');
  });

  it('starts an earlier day at 9:00 AM', () => {
    const start = defaultStartFor(now.subtract(1, 'day'), 1.5 * HOUR, now);
    expect(start.format('YYYY-MM-DD HH:mm')).toBe('2026-10-11 09:00');
  });

  it('combines the chosen day with the chosen time of day', () => {
    const start = combineDayAndTime(dayjs(new Date(2026, 9, 10)), dayjs(new Date(2026, 0, 1, 8, 45, 30)));
    expect(start).toEqual(new Date(2026, 9, 10, 8, 45, 0));
  });

  it('rejects entries that end in the future or run past 24 hours', () => {
    expect(validateEntryTiming(new Date(2026, 9, 12, 14, 30), HOUR, NOW.getTime())).toMatch(/future/);
    expect(validateEntryTiming(new Date(2026, 9, 10, 9, 0), 24 * HOUR + 60_000, NOW.getTime())).toBe(
      'A time entry can be at most 24 hours'
    );
    expect(validateEntryTiming(new Date(2026, 9, 12, 14, 0), HOUR, NOW.getTime())).toBeNull();
  });
});

describe('AddTimeDialog', () => {
  const tasks: Task[] = [
    { id: 't1', name: 'Annotation', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't2', name: 'Retired', isArchived: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ];
  const onAdd = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    onAdd.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderDialog = () =>
    render(<AddTimeDialog open onClose={onClose} tasks={tasks} sessions={[]} onAdd={onAdd} />);

  const chooseTask = (name: string) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Task' }));
    fireEvent.click(screen.getByRole('option', { name }));
  };

  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Add Time' }));

  // The Start time picker has Hours/Minutes sections too; the duration's
  // fields are the number inputs.
  const durationInput = (label: 'Hours' | 'Minutes') =>
    screen
      .getAllByLabelText(label)
      .find(el => (el as HTMLInputElement).type === 'number') as HTMLInputElement;

  it('offers active tasks only', () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Task' }));
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Annotation']);
  });

  it('adds today’s entry ending now by default', async () => {
    renderDialog();
    chooseTask('Annotation');

    submit();

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        taskId: 't1',
        taskName: 'Annotation',
        startTime: new Date(2026, 9, 12, 14, 0, 0), // now − the 1h default
        durationMs: HOUR,
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('dates the default entry yesterday when it would start before midnight', async () => {
    vi.setSystemTime(new Date(2026, 9, 12, 0, 30, 0));
    renderDialog();
    chooseTask('Annotation');

    submit();

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: new Date(2026, 9, 11, 23, 30, 0), durationMs: HOUR })
      )
    );
  });

  it('moves the default start as the duration changes', async () => {
    renderDialog();
    chooseTask('Annotation');

    fireEvent.change(durationInput('Hours'), { target: { value: '2' } });
    fireEvent.change(durationInput('Minutes'), { target: { value: '30' } });
    submit();

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: new Date(2026, 9, 12, 12, 30, 0),
          durationMs: 2.5 * HOUR,
        })
      )
    );
  });

  it('requires a task and a non-zero duration', async () => {
    renderDialog();

    submit();
    expect(await screen.findByText('Choose a task')).toBeInTheDocument();

    chooseTask('Annotation');
    fireEvent.change(durationInput('Hours'), { target: { value: '0' } });
    fireEvent.change(durationInput('Minutes'), { target: { value: '0' } });
    submit();

    expect(await screen.findByText('Duration must be greater than zero')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows the reason in place when the entry is refused', async () => {
    onAdd.mockRejectedValue(new Error('This overlaps time already tracked for "Review"'));
    renderDialog();
    chooseTask('Annotation');

    submit();

    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByText('This overlaps time already tracked for "Review"')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
