import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '../../../../__tests__/setup/test-helpers';
import { seedAppRecords } from '../../../../testing';
import { readAppRecord } from '../../../../services/appRecords';
import { PayoutDayCell } from '../../../../utils/payoutCalculator';
import {
  createMockAmount,
  createMockPlan,
  createMockReleaseEvent,
  createMockWithdrawal,
  renderWithMoney,
} from '../../../../__tests__/setup/payout-test-utils';
import { CalendarDayDialog } from '../CalendarDayDialog';

const NOW = new Date(2026, 10, 7, 12, 0).getTime();

function cell(overrides: Partial<PayoutDayCell> = {}): PayoutDayCell {
  return {
    workDay: '2026-11-05',
    taskId: 'armadillo',
    taskName: 'Armadillo',
    actualCents: 63334,
    estimatedCents: 0,
    trackedMs: 6 * 3_600_000 + 20 * 60_000,
    importedMinutes: 380,
    statuses: ['Pending Approval'],
    releaseDay: '2026-11-13',
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
    ...overrides,
  };
}

function open(date: string | null, data = {}) {
  const onChangeDate = vi.fn();
  const onClose = vi.fn();
  renderWithMoney(<CalendarDayDialog date={date} onChangeDate={onChangeDate} onClose={onClose} />, {
    nowMs: NOW,
    ...data,
  });
  return { onChangeDate, onClose };
}

describe('CalendarDayDialog', () => {
  it('renders nothing while closed', () => {
    open(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("shows the day's work: tracked against reported time, amounts and the site's statuses", () => {
    open('2026-11-05', {
      cells: [
        cell(),
        cell({
          taskId: 'wolverine',
          taskName: 'Wolverine',
          actualCents: 0,
          estimatedCents: 8000,
          trackedMs: 0,
          importedMinutes: 0,
          isEstimate: true,
        }),
        cell({ workDay: '2026-11-06' }),
      ],
    });

    expect(screen.getByRole('heading', { name: /Thursday, November 5, 2026/ })).toBeInTheDocument();
    const worked = within(screen.getByRole('table', { name: 'Worked' }));
    const armadillo = worked.getByRole('row', { name: /Armadillo/ });
    expect(armadillo).toHaveTextContent('6h 20m');
    expect(armadillo).toHaveTextContent('$633.34');
    expect(armadillo).toHaveTextContent('Pending Approval');
    const wolverine = worked.getByRole('row', { name: /Wolverine/ });
    expect(wolverine).toHaveTextContent('—');
    expect(wolverine).toHaveTextContent('~$80.00');
    expect(wolverine).toHaveTextContent('Estimate');
    expect(worked.getByRole('row', { name: /Total/ })).toHaveTextContent('$633.34 + ~$80.00');
  });

  it('lists the money released that day, with times, and marks what is still to come', () => {
    open('2026-11-10', {
      events: [
        createMockReleaseEvent(),
        createMockReleaseEvent({
          releaseTime: undefined,
          releaseMs: new Date(2026, 10, 10).getTime(),
          actualCents: 0,
          estimatedCents: 1500,
          status: undefined,
          taskName: 'Armadillo',
        }),
        createMockReleaseEvent({ releaseMs: new Date(2026, 10, 11, 1).getTime() }),
      ],
      nowMs: new Date(2026, 10, 10, 12).getTime(),
    });

    const released = within(screen.getByRole('table', { name: 'Released' }));
    const rows = released.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('11:53 PM');
    expect(rows[0]).toHaveTextContent('upcoming');
    expect(rows[0]).toHaveTextContent('Tue, Nov 3');
    expect(rows[0]).toHaveTextContent('Pending Approval');
    expect(rows[1]).toHaveTextContent('—Armadillo');
    expect(rows[1]).toHaveTextContent('~$15.00');
    expect(rows[1]).toHaveTextContent('Estimate');
    expect(rows[1]).not.toHaveTextContent('upcoming');
  });

  it("says when the next withdrawal opens that day, and how much it'll be", () => {
    open('2026-11-10', {
      plan: createMockPlan({ next: createMockAmount({ actualCents: 1000, estimatedCents: 500 }) }),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Your next withdrawal opens at 6:25 PM: ~$15.00.');
  });

  it('gives an all-imported opening amount without a ~', () => {
    open('2026-11-10', { plan: createMockPlan() });
    expect(screen.getByRole('alert')).toHaveTextContent('Your next withdrawal opens at 6:25 PM: $1,100.00.');
  });

  it('says nothing about an opening on another day, or one that is already open', () => {
    open('2026-11-09', { plan: createMockPlan() });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing tracked, released or withdrawn on this day.')).toBeInTheDocument();
  });

  it('lists, edits and deletes the withdrawals made that day', () => {
    const taken = createMockWithdrawal({ takenAt: new Date(2026, 10, 7, 9, 15).toISOString(), note: 'PayPal' });
    const noNote = createMockWithdrawal({ id: 'no-note', takenAt: new Date(2026, 10, 7, 20, 0).toISOString() });
    seedAppRecords({
      withdrawals: [taken, noNote, createMockWithdrawal({ id: 'other', takenAt: new Date(2026, 10, 2).toISOString() })],
    });
    open('2026-11-07', { withdrawals: [] });

    const withdrawals = within(screen.getByRole('table', { name: 'Withdrawals' }));
    const [morning, evening] = withdrawals.getAllByRole('row');
    expect(morning).toHaveTextContent('9:15 AM$712.50PayPal');
    expect(evening).toHaveTextContent('8:00 PM$712.50');

    fireEvent.click(withdrawals.getByRole('button', { name: 'Edit the withdrawal at 9:15 AM' }));
    expect(screen.getByRole('dialog', { name: 'Edit withdrawal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(withdrawals.getByRole('button', { name: 'Delete the withdrawal at 9:15 AM' }));
    expect(readAppRecord('withdrawals')).toEqual([
      expect.objectContaining({ id: 'no-note' }),
      expect.objectContaining({ id: 'other' }),
    ]);
  });

  it('records a withdrawal on a past day, but not a future one', () => {
    open('2026-11-07');
    fireEvent.click(screen.getByRole('button', { name: 'Record withdrawal on this day' }));
    expect(screen.getByRole('dialog', { name: 'Record withdrawal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Record withdrawal' })).not.toBeInTheDocument();
  });

  it('has no record button on a day still to come', () => {
    open('2026-11-08');
    expect(screen.queryByRole('button', { name: 'Record withdrawal on this day' })).not.toBeInTheDocument();
  });

  it('steps to the day before or after, and closes', () => {
    const { onChangeDate, onClose } = open('2026-11-01');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(onChangeDate).toHaveBeenLastCalledWith('2026-10-31');
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(onChangeDate).toHaveBeenLastCalledWith('2026-11-02');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
