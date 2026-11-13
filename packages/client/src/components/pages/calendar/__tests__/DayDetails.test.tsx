import { describe, expect, it } from 'vitest';
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
import { buildCalendarMonth, CalendarDay, CalendarMonthInput } from '../calendarMonth';
import { DayDetails } from '../DayDetails';

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

/** The day as the agenda has it, and its breakdown open. */
function open(date: string, data: Partial<CalendarMonthInput> = {}) {
  const input: CalendarMonthInput = {
    cells: [],
    events: [],
    withdrawals: [],
    plan: null,
    nowMs: NOW,
    goalFor: () => null,
    ...data,
  };
  const day = buildCalendarMonth(date.slice(0, 7), input)
    .weeks.flatMap(week => week.days)
    .find(d => d.date === date) as CalendarDay;
  return renderWithMoney(<DayDetails day={day} />, input);
}

describe('DayDetails', () => {
  it("lists each task's time, amount and statuses, with a total, and the goal", () => {
    open('2026-11-05', {
      cells: [
        cell(),
        cell({
          taskId: 'wolverine',
          taskName: 'Wolverine',
          actualCents: 0,
          estimatedCents: 8000,
          trackedMs: 3_600_000,
          importedMinutes: 0,
          isEstimate: true,
        }),
        // Money with no time
        cell({ taskId: 'bonus', taskName: 'Bonus', trackedMs: 0, importedMinutes: 0, actualCents: 1000, statuses: [] }),
      ],
      goalFor: () => 400,
    });

    const worked = within(screen.getByRole('list', { name: 'Worked' }));
    const [armadillo, wolverine, bonus, total] = worked.getAllByRole('listitem');
    expect(armadillo).toHaveTextContent('Armadillo$633.346h 20m tracked · 6h 20m reported');
    expect(armadillo).toHaveTextContent('Pending Approval');
    expect(wolverine).toHaveTextContent('Wolverine~$80.001h 0m tracked');
    expect(wolverine).toHaveTextContent('Estimate');
    expect(bonus).toHaveTextContent(/^Bonus\$10\.00$/);
    expect(total).toHaveTextContent('Total$643.34 + ~$80.007h 20m tracked · 6h 20m reported');
    expect(screen.getByText('181% of the daily goal')).toBeInTheDocument();
  });

  it('shows one task without a total, and no goal line without a goal', () => {
    open('2026-11-05', { cells: [cell()] });
    expect(within(screen.getByRole('list', { name: 'Worked' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(/of the daily goal/)).not.toBeInTheDocument();
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
      ],
      nowMs: new Date(2026, 10, 10, 12).getTime(),
    });
    const [later, early] = within(screen.getByRole('list', { name: 'Released' })).getAllByRole('listitem');
    expect(later).toHaveTextContent('11:53 PM · Wolverine$525.00Worked on Tue, Nov 3 · upcoming');
    expect(later).toHaveTextContent('Pending Approval');
    expect(early).toHaveTextContent('Armadillo~$15.00Worked on Tue, Nov 3');
    expect(early).not.toHaveTextContent('upcoming');
    expect(early).toHaveTextContent('Estimate');
  });

  it('says when the next withdrawal opens that day, and that nothing else happened', () => {
    open('2026-11-10', {
      plan: createMockPlan({ next: createMockAmount({ actualCents: 1000, estimatedCents: 500 }) }),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Your next withdrawal opens at 6:25 PM: ~$15.00.');
    expect(screen.getByText('Nothing tracked, released or withdrawn on this day.')).toBeInTheDocument();
  });

  it('lists, edits and deletes the withdrawals made that day', () => {
    const taken = createMockWithdrawal({ takenAt: new Date(2026, 10, 7, 9, 15).toISOString(), note: 'PayPal' });
    const noNote = createMockWithdrawal({ id: 'no-note', takenAt: new Date(2026, 10, 7, 20, 0).toISOString() });
    seedAppRecords({ withdrawals: [taken, noNote] });
    open('2026-11-07', { withdrawals: [taken, noNote] });

    const withdrawals = within(screen.getByRole('list', { name: 'Withdrawals' }));
    const [morning, evening] = withdrawals.getAllByRole('listitem');
    expect(morning).toHaveTextContent('9:15 AMPayPal$712.50');
    expect(evening).toHaveTextContent(/^8:00 PM\$712\.50$/);

    fireEvent.click(withdrawals.getByRole('button', { name: 'Edit the withdrawal at 9:15 AM' }));
    expect(screen.getByRole('dialog', { name: 'Edit withdrawal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(withdrawals.getByRole('button', { name: 'Delete the withdrawal at 9:15 AM' }));
    expect(readAppRecord('withdrawals')).toEqual([expect.objectContaining({ id: 'no-note' })]);
  });

  it('records a withdrawal on today or a past day, but not a day to come', () => {
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
});
