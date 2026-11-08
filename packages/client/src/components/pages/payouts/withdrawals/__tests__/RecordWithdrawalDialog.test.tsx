import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, within } from '../../../../../__tests__/setup/test-helpers';
import { seedAppRecords } from '../../../../../testing';
import { readAppRecord } from '../../../../../services/appRecords';
import {
  createMockReleaseEvent,
  createMockWithdrawal,
  renderWithMoney,
} from '../../../../../__tests__/setup/payout-test-utils';
import { RecordWithdrawalDialog, RecordWithdrawalDialogProps, parseAmountCents } from '../RecordWithdrawalDialog';

const NOW = new Date(2026, 10, 10, 12, 0);
const LAST = createMockWithdrawal({ id: 'last', takenAt: new Date(2026, 10, 7, 18, 25).toISOString() });

function open(props: Partial<RecordWithdrawalDialogProps> = {}, data = {}) {
  const onClose = vi.fn();
  renderWithMoney(<RecordWithdrawalDialog onClose={onClose} {...props} />, {
    nowMs: NOW.getTime(),
    events: [
      createMockReleaseEvent({ releaseMs: new Date(2026, 10, 8, 9).getTime(), actualCents: 52500 }),
      createMockReleaseEvent({
        releaseMs: new Date(2026, 10, 9, 9).getTime(),
        actualCents: 0,
        estimatedCents: 8000,
        status: undefined,
      }),
    ],
    ...data,
  });
  return onClose;
}

const amount = () => screen.getByRole('textbox', { name: 'Amount withdrawn' });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const field = (label: string) => screen.getAllByRole('group').find(group => group.textContent?.includes(label))!;
const section = (label: string, index: number) => within(field(label)).getAllByRole('spinbutton')[index];

describe('parseAmountCents', () => {
  it('reads dollars and cents, and refuses anything else', () => {
    expect(parseAmountCents('$1,234.5')).toBe(123450);
    expect(parseAmountCents(' 712.50 ')).toBe(71250);
    expect(parseAmountCents('.5')).toBe(50);
    expect(parseAmountCents('0')).toBe(0);
    expect(parseAmountCents('')).toBeNull();
    expect(parseAmountCents('1.234')).toBeNull();
    expect(parseAmountCents('ten')).toBeNull();
  });
});

describe('RecordWithdrawalDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('records the first withdrawal as typed, at the time it was made', () => {
    const onClose = open();
    expect(screen.getByRole('dialog', { name: 'Record withdrawal' })).toBeInTheDocument();
    expect(amount()).toHaveValue('');
    expect(screen.getByText('What the payment site paid out.')).toBeInTheDocument();

    save();
    expect(screen.getByText('Enter the amount you withdrew, like 712.50')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(amount(), { target: { value: '712.50' } });
    expect(screen.queryByText(/Enter the amount/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'PayPal' } });
    save();

    expect(readAppRecord('withdrawals')).toEqual([
      expect.objectContaining({ takenAt: NOW.toISOString(), amountCents: 71250, note: 'PayPal' }),
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('starts at what TaskMint expects since the withdrawal before, until it is typed over', () => {
    seedAppRecords({ withdrawals: [LAST] });
    open();
    expect(amount()).toHaveValue('605.00');
    expect(
      screen.getByText(
        'TaskMint expects $605.00 (~$80.00 of it estimated): what was released since your withdrawal on Nov 7, 6:25 PM.'
      )
    ).toBeInTheDocument();

    fireEvent.change(amount(), { target: { value: '600' } });
    save();
    expect(readAppRecord('withdrawals')).toEqual([LAST, expect.objectContaining({ amountCents: 60000 })]);
  });

  it("leaves out the estimate note when it's all imported money", () => {
    seedAppRecords({ withdrawals: [LAST] });
    open({}, { events: [createMockReleaseEvent({ releaseMs: new Date(2026, 10, 8, 9).getTime() })] });
    expect(
      screen.getByText('TaskMint expects $525.00: what was released since your withdrawal on Nov 7, 6:25 PM.')
    ).toBeInTheDocument();
  });

  it('warns about a withdrawal too soon after another, but still records it', () => {
    seedAppRecords({ withdrawals: [LAST] });
    open({}, { withdrawalIntervalDays: 3 });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "That's within 3 days of your withdrawal on Nov 7, 6:25 PM. The payment site normally allows one withdrawal every 3 days."
    );
    save();
    expect(readAppRecord('withdrawals')).toHaveLength(2);
  });

  it('says "day" for a one-day wait', () => {
    seedAppRecords({ withdrawals: [createMockWithdrawal({ takenAt: new Date(2026, 10, 10, 1).toISOString() })] });
    open({}, { withdrawalIntervalDays: 1 });
    expect(screen.getByRole('alert')).toHaveTextContent('within 1 day of your withdrawal');
    expect(screen.getByRole('alert')).toHaveTextContent('one withdrawal every 1 day.');
  });

  it('refuses a time in the future', async () => {
    const typing = userEvent.setup();
    open();
    fireEvent.change(amount(), { target: { value: '1' } });
    // 1 PM, an hour from now
    await typing.click(section('Time', 0));
    await typing.keyboard('1');
    save();
    expect(screen.getByText("A withdrawal can't be in the future")).toBeInTheDocument();
    expect(readAppRecord('withdrawals')).toBeUndefined();

    // A day earlier, at that time, is fine
    await typing.click(section('Date', 1));
    await typing.keyboard('9');
    expect(screen.queryByText("A withdrawal can't be in the future")).not.toBeInTheDocument();
    save();
    expect(readAppRecord('withdrawals')).toEqual([
      expect.objectContaining({ takenAt: new Date(2026, 10, 9, 13, 0).toISOString() }),
    ]);
  });

  it('starts a withdrawal on an earlier day at noon, and on today at the current time', () => {
    open({ initialDay: '2026-11-08' });
    fireEvent.change(amount(), { target: { value: '5' } });
    save();
    expect(readAppRecord('withdrawals')).toEqual([
      expect.objectContaining({ takenAt: new Date(2026, 10, 8, 12, 0).toISOString() }),
    ]);
  });

  it('starts one on today at the current time', () => {
    open({ initialDay: '2026-11-10' });
    fireEvent.change(amount(), { target: { value: '5' } });
    save();
    expect(readAppRecord('withdrawals')).toEqual([expect.objectContaining({ takenAt: NOW.toISOString() })]);
  });

  it('edits a withdrawal, leaving it out of its own warnings and expectation', () => {
    seedAppRecords({ withdrawals: [LAST] });
    const onClose = open({ withdrawal: LAST });
    expect(screen.getByRole('dialog', { name: 'Edit withdrawal' })).toBeInTheDocument();
    expect(amount()).toHaveValue('712.50');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('What the payment site paid out.')).toBeInTheDocument();

    fireEvent.change(amount(), { target: { value: '700' } });
    save();
    expect(readAppRecord('withdrawals')).toEqual([
      expect.objectContaining({ id: 'last', takenAt: LAST.takenAt, amountCents: 70000 }),
    ]);
    expect(onClose).toHaveBeenCalled();
  });
});
