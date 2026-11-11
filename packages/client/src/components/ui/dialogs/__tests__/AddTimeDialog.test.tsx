import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import dayjs from 'dayjs';
import {
  AddTimeDialog,
  combineDayAndTime,
  defaultStartFor,
  endsNowStart,
  validateEntryTiming,
  whenComplete,
} from '../AddTimeDialog';
import { Task } from '../../../../types/task';

const HOUR = 3_600_000;
// A fixed local "now": Oct 12 2026, 3:00 PM
const NOW = new Date(2026, 9, 12, 15, 0, 0);

describe('whenComplete', () => {
  it('applies a whole date, not a cleared or half-typed one', () => {
    const apply = vi.fn();
    whenComplete(apply)(null);
    whenComplete(apply)(dayjs('not a date'));
    expect(apply).not.toHaveBeenCalled();

    whenComplete(apply)(dayjs(NOW));
    expect(apply).toHaveBeenCalledWith(dayjs(NOW));
  });
});

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

  it('keeps a long same-day entry on the chosen day', () => {
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
    {
      id: 't2',
      name: 'Retired',
      isArchived: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];
  const onAdd = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    onAdd.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderDialog = () => render(<AddTimeDialog onClose={onClose} tasks={tasks} sessions={[]} onAdd={onAdd} />);

  const chooseTask = (name: string) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Task/ }));
    fireEvent.click(screen.getByRole('option', { name }));
  };

  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Add Time' }));

  // The Start time picker has Hours/Minutes sections too; the duration's
  // fields are the number inputs.
  const durationInput = (label: 'Hours' | 'Minutes') =>
    screen.getAllByLabelText(label).find(el => (el as HTMLInputElement).type === 'number') as HTMLInputElement;

  it('offers active tasks only', () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Task/ }));
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
    expect(await within(dialog).findByText('This overlaps time already tracked for "Review"')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('picking the date and start', () => {
    const user = () => userEvent.setup();
    const field = (label: string) => screen.getAllByRole('group').find(group => group.textContent?.includes(label))!;
    const section = (label: string, index: number) => within(field(label)).getAllByRole('spinbutton')[index];
    const summary = () => screen.getByText(/ on [A-Z][a-z]{2}, /).textContent;

    it('keeps a start typed by hand when the duration changes', async () => {
      const typing = user();
      renderDialog();
      // The default start is 2:00 PM: typing the hour keeps the PM
      await typing.click(section('Start', 0));
      await typing.keyboard('1');
      expect(summary()).toMatch(/starting 1:00 PM/);

      fireEvent.change(durationInput('Hours'), { target: { value: '2' } });
      expect(summary()).toMatch(/^2h 0m .*starting 1:00 PM/);
    });

    it('starts an earlier day picked by hand at 9:00 AM', async () => {
      const typing = user();
      renderDialog();
      await typing.click(section('Date', 1));
      await typing.keyboard('1');

      expect(summary()).toMatch(/on Thu, Oct 1, starting 9:00 AM/);
    });

    it('refuses an entry that would end in the future', async () => {
      const typing = user();
      renderDialog();
      chooseTask('Annotation');
      // 9:00 PM, hours from now
      await typing.click(section('Start', 0));
      await typing.keyboard('9');

      submit();
      expect(await screen.findByText(/would end in the future/)).toBeInTheDocument();
      expect(onAdd).not.toHaveBeenCalled();
    });
  });

  it("moves the entry's day back when a longer duration starts it yesterday", () => {
    // 1:30 AM: the 1h default starts today, 2h starts yesterday
    vi.setSystemTime(new Date(2026, 9, 12, 1, 30, 0));
    renderDialog();
    expect(screen.getByText(/ on [A-Z][a-z]{2}, /)).toHaveTextContent('on Mon, Oct 12, starting 12:30 AM');

    fireEvent.change(durationInput('Hours'), { target: { value: '2' } });
    expect(screen.getByText(/ on [A-Z][a-z]{2}, /)).toHaveTextContent('on Sun, Oct 11, starting 11:30 PM');
  });

  it('shows a refusal that came back as plain text', async () => {
    onAdd.mockRejectedValue('Overlaps "Review"');
    renderDialog();
    chooseTask('Annotation');

    submit();
    expect(await screen.findByText('Overlaps "Review"')).toBeInTheDocument();
  });

  it('marks favorites, and says where tasks come from when there are none', () => {
    const { unmount } = render(
      <AddTimeDialog onClose={onClose} tasks={[{ ...tasks[0], isFavorite: true }]} sessions={[]} onAdd={onAdd} />
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Task/ }));
    expect(screen.getByRole('option', { name: '★Annotation' })).toBeInTheDocument();
    unmount();

    render(<AddTimeDialog onClose={onClose} tasks={[tasks[1]]} sessions={[]} onAdd={onAdd} />);
    expect(screen.getByText('Add a task on the Tasks page first')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Task/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Add Time' })).toBeDisabled();
  });
});
