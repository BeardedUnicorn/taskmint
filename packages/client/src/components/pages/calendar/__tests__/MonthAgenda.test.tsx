import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, within } from '../../../../__tests__/setup/test-helpers';
import {
  createMockPlan,
  createMockReleaseEvent,
  createMockWithdrawal,
  renderWithMoney,
} from '../../../../__tests__/setup/payout-test-utils';
import { PayoutDayCell } from '../../../../utils/payoutCalculator';
import { buildCalendarMonth, CalendarMonthInput } from '../calendarMonth';
import { MonthAgenda } from '../MonthAgenda';

const NOW = new Date(2026, 10, 7, 12, 0).getTime();

function cell(workDay: string, overrides: Partial<PayoutDayCell> = {}): PayoutDayCell {
  return {
    workDay,
    taskId: 'armadillo',
    taskName: 'Armadillo',
    actualCents: 40000,
    estimatedCents: 5000,
    trackedMs: 3_600_000,
    importedMinutes: 0,
    statuses: [],
    releaseDay: '2026-11-12',
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
    ...overrides,
  };
}

const monthInput: CalendarMonthInput = {
  cells: [cell('2026-11-05'), cell('2026-12-02', { estimatedCents: 0, trackedMs: 0, importedMinutes: 30 })],
  events: [createMockReleaseEvent()],
  withdrawals: [createMockWithdrawal({ takenAt: new Date(2026, 10, 3, 9, 15).toISOString() })],
  plan: createMockPlan({ opensAtMs: new Date(2026, 10, 8, 18, 25).getTime() }),
  nowMs: NOW,
  goalFor: date => (date === '2026-11-05' ? 400 : date === '2026-12-02' ? 800 : null),
};

/** The agenda as the Calendar page drives it: one day open at a time. */
function Harness() {
  const [openDay, setOpenDay] = useState<string | null>(null);
  return (
    <>
      <h2 id="title">November 2026</h2>
      <MonthAgenda
        view={buildCalendarMonth('2026-11', monthInput)}
        openDay={openDay}
        onToggleDay={date => setOpenDay(openDay === date ? null : date)}
        labelledBy="title"
      />
    </>
  );
}

const render = () => renderWithMoney(<Harness />, monthInput);
const dayRow = (date: string) => document.querySelector<HTMLElement>(`[data-date="${date}"]`);

describe('MonthAgenda', () => {
  it("lists the month's weeks with their totals", () => {
    render();
    const month = screen.getByRole('list', { name: 'November 2026' });
    const weeks = within(month)
      .getAllByRole('listitem')
      .filter(item => item.parentElement === month);
    expect(weeks.map(week => week.getAttribute('aria-label'))).toEqual([
      'Week of Nov 1: 1h 0m, ~$450.00',
      'Week of Nov 8: nothing tracked',
      'Week of Nov 15: nothing tracked',
      'Week of Nov 22: nothing tracked',
      'Week of Nov 29: 30m, $400.00',
    ]);
    expect(weeks[0]).toHaveTextContent('Week of Nov 11h 0m~$450.00');
    expect(weeks[2]).toHaveTextContent('Nothing tracked');
  });

  it('gives a row to each day with something on it, and to today', () => {
    render();
    const rows = [...document.querySelectorAll('[data-date]')].map(row => row.getAttribute('data-date'));
    // Withdrawal, work, today, the opening, a release, and the next month's work in the last week
    expect(rows).toEqual(['2026-11-03', '2026-11-05', '2026-11-07', '2026-11-08', '2026-11-10', '2026-12-02']);

    const worked = dayRow('2026-11-05')!;
    expect(worked).toHaveTextContent('Thu5');
    expect(worked).toHaveTextContent('1h 0m');
    expect(worked).toHaveTextContent('~$450.00');
    expect(within(worked).getByRole('progressbar', { hidden: true })).toHaveAttribute('aria-valuenow', '100');
    expect(worked).toHaveAccessibleName(
      'Thursday, November 5, 2026: worked 1h 0m, earned about $450.00; 113% of the daily goal'
    );

    expect(dayRow('2026-11-03')).toHaveTextContent('$712.50');
    expect(dayRow('2026-11-08')).toHaveTextContent('6:25 PM');
    expect(dayRow('2026-11-10')).toHaveTextContent('$525.00');
    expect(dayRow('2026-11-07')).toHaveTextContent('Sat7');
    const nextMonth = dayRow('2026-12-02')!;
    expect(nextMonth).toHaveTextContent('$400.00');
    expect(within(nextMonth).getByRole('progressbar', { hidden: true })).toHaveAttribute('aria-valuenow', '50');
  });

  it('opens one day at a time in place, and closes it again', () => {
    render();
    const thursday = dayRow('2026-11-05')!;
    expect(thursday).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(thursday);
    expect(thursday).toHaveAttribute('aria-expanded', 'true');
    const details = document.getElementById(thursday.getAttribute('aria-controls')!)!;
    expect(within(details).getByRole('list', { name: 'Worked' })).toHaveTextContent('Armadillo');

    fireEvent.click(dayRow('2026-11-03')!);
    expect(thursday).toHaveAttribute('aria-expanded', 'false');
    expect(dayRow('2026-11-03')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(dayRow('2026-11-03')!);
    expect(dayRow('2026-11-03')).toHaveAttribute('aria-expanded', 'false');
  });
});
