import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '../../../../__tests__/setup/test-helpers';
import { createAppTheme } from '../../../../theme';
import { createMockPlan, createMockWithdrawal } from '../../../../__tests__/setup/payout-test-utils';
import { buildCalendarMonth, CalendarDay, CalendarMonthInput } from '../calendarMonth';
import { MonthGrid, keyTarget } from '../MonthGrid';
import { describeDay } from '../DayCell';

const NOW = new Date(2026, 10, 7, 12, 0).getTime();

const input = (overrides: Partial<CalendarMonthInput> = {}): CalendarMonthInput => ({
  cells: [],
  events: [],
  withdrawals: [],
  plan: null,
  nowMs: NOW,
  goalFor: () => null,
  ...overrides,
});

function calendarDay(overrides: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date: '2026-11-05',
    dayOfMonth: 5,
    inMonth: true,
    isToday: false,
    earnedCents: 0,
    estimatedCents: 0,
    timeMs: 0,
    releasedCents: 0,
    releasedEstimatedCents: 0,
    releasesAhead: false,
    withdrawals: [],
    opensAtMs: null,
    openNow: false,
    goal: null,
    ...overrides,
  };
}

/** The grid as the page drives it: it keeps the focused day and the month. */
function Harness({
  monthInput = input(),
  onOpenDay = vi.fn(),
}: {
  monthInput?: CalendarMonthInput;
  onOpenDay?: (date: string) => void;
}) {
  const [month, setMonth] = useState('2026-11');
  const [focused, setFocused] = useState('2026-11-07');
  return (
    <>
      <h2 id="title">{month}</h2>
      <MonthGrid
        view={buildCalendarMonth(month, monthInput)}
        focusedDate={focused}
        onFocusDate={setFocused}
        onMonthChange={setMonth}
        onOpenDay={onOpenDay}
        labelledBy="title"
      />
      <button onClick={() => setFocused('2027-03-01')}>elsewhere</button>
    </>
  );
}

const dayButton = (date: string) => document.querySelector<HTMLElement>(`[data-date="${date}"]`)!;
const weekCell = (label: string) => document.querySelector(`[role="gridcell"][aria-label="${label}"]`);

describe('keyTarget', () => {
  it('moves by day, week, week end and month, and ignores other keys', () => {
    expect(keyTarget('ArrowLeft', '2026-11-01')).toBe('2026-10-31');
    expect(keyTarget('ArrowRight', '2026-11-07')).toBe('2026-11-08');
    expect(keyTarget('ArrowUp', '2026-11-07')).toBe('2026-10-31');
    expect(keyTarget('ArrowDown', '2026-11-07')).toBe('2026-11-14');
    expect(keyTarget('Home', '2026-11-05')).toBe('2026-11-01');
    expect(keyTarget('End', '2026-11-05')).toBe('2026-11-07');
    expect(keyTarget('PageUp', '2026-03-31')).toBe('2026-02-28');
    expect(keyTarget('PageDown', '2026-11-07')).toBe('2026-12-07');
    expect(keyTarget('a', '2026-11-07')).toBeNull();
  });
});

describe('describeDay', () => {
  it('says what happened on the day', () => {
    expect(describeDay(calendarDay())).toBe('Thursday, November 5, 2026: nothing tracked');
    expect(
      describeDay(
        calendarDay({
          earnedCents: 68334,
          estimatedCents: 5000,
          timeMs: 3_600_000,
          releasedCents: 71250,
          withdrawals: [createMockWithdrawal({ takenAt: new Date(2026, 10, 5, 18, 25).toISOString() })],
          opensAtMs: new Date(2026, 10, 5, 20, 0).getTime(),
          openNow: true,
        })
      )
    ).toBe(
      'Thursday, November 5, 2026: worked 1h 0m, earned about $683.34; $712.50 released; withdrew $712.50 at 6:25 PM; next withdrawal opens at 8:00 PM; withdrawal open now'
    );
    expect(describeDay(calendarDay({ earnedCents: 100, releasedCents: 50, releasesAhead: true }))).toBe(
      'Thursday, November 5, 2026: earned $1.00; $0.50 to be released'
    );
  });
});

describe('MonthGrid', () => {
  it('heads the days of the week and labels each day', () => {
    render(<Harness />);
    expect(screen.getByRole('grid', { name: '2026-11' })).toBeInTheDocument();
    // The week column shows only in a wide grid (a container query jsdom doesn't apply)
    expect(screen.getAllByRole('columnheader', { hidden: true }).map(header => header.textContent)).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Week',
    ]);
    expect(screen.getByRole('button', { name: 'Saturday, November 7, 2026: nothing tracked' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    // A hidden element has no accessible name to query by, so by its label
    expect(weekCell('Week of Nov 1: nothing tracked')).toBeInTheDocument();
  });

  it("shows each day's figures and badges, and the week's totals", () => {
    const releaseAt = new Date(2026, 10, 5, 9).getTime();
    render(
      <ThemeProvider theme={createAppTheme('dark')}>
        <Harness
          monthInput={input({
            cells: [
              {
                workDay: '2026-11-05',
                taskId: 't',
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
              },
              {
                workDay: '2026-11-06',
                taskId: 't',
                taskName: 'Armadillo',
                actualCents: 10000,
                estimatedCents: 0,
                trackedMs: 0,
                importedMinutes: 0,
                statuses: [],
                releaseDay: '2026-11-13',
                isEstimate: false,
                untransferredCents: 0,
                paidCents: 0,
              },
            ],
            events: [
              {
                releaseDay: '2026-11-05',
                releaseMs: releaseAt,
                actualCents: 0,
                estimatedCents: 2500,
                taskId: 't',
                taskName: 'Armadillo',
                workDay: '2026-10-29',
              },
              {
                releaseDay: '2026-11-10',
                releaseMs: new Date(2026, 10, 10, 23, 53).getTime(),
                actualCents: 52500,
                estimatedCents: 0,
                taskId: 't',
                taskName: 'Armadillo',
                workDay: '2026-11-03',
                status: 'Pending Approval',
              },
            ],
            withdrawals: [createMockWithdrawal({ takenAt: new Date(2026, 10, 5, 18, 25).toISOString() })],
            plan: createMockPlan({ opensAtMs: new Date(2026, 10, 8, 18, 25).getTime() }),
            goalFor: date => (date === '2026-11-05' ? 400 : date === '2026-11-06' ? 50 : null),
          })}
        />
      </ThemeProvider>
    );

    const thursday = dayButton('2026-11-05');
    expect(thursday).toHaveTextContent('~$450');
    expect(thursday).toHaveTextContent('~$450.00');
    expect(thursday).toHaveTextContent('1h 0m');
    expect(thursday).toHaveTextContent('~$25.00');
    expect(thursday).toHaveTextContent('$712.50');
    expect(dayButton('2026-11-06')).toHaveTextContent('$100.00');
    expect(dayButton('2026-11-08')).toHaveTextContent('Opens 6:25 PM');
    expect(dayButton('2026-11-10')).toHaveTextContent('$525.00');
    expect(screen.getAllByRole('progressbar', { hidden: true })).toHaveLength(2);
    expect(weekCell('Week of Nov 1: 1h 0m, ~$550.00')).toHaveTextContent('~$550.00');
  });

  it("shows when the withdrawal is open on today's cell", () => {
    render(<Harness monthInput={input({ plan: createMockPlan({ opensAtMs: NOW, isOpen: true }) })} />);
    expect(dayButton('2026-11-07')).toHaveTextContent('Open now');
  });

  it('moves the focus with the keys, into the next month when it runs off this one', () => {
    const onOpenDay = vi.fn();
    render(<Harness onOpenDay={onOpenDay} />);
    const grid = screen.getByRole('grid');

    dayButton('2026-11-07').focus();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(dayButton('2026-11-08')).toHaveFocus();
    expect(dayButton('2026-11-08')).toHaveAttribute('tabindex', '0');
    expect(dayButton('2026-11-07')).toHaveAttribute('tabindex', '-1');

    // Already at the week's start: nothing moves
    fireEvent.keyDown(grid, { key: 'Home' });
    expect(dayButton('2026-11-08')).toHaveFocus();
    // Not the grid's key
    fireEvent.keyDown(grid, { key: 'x' });

    fireEvent.keyDown(grid, { key: 'PageDown' });
    expect(screen.getByRole('heading', { name: '2026-12' })).toBeInTheDocument();
    expect(dayButton('2026-12-08')).toHaveFocus();

    // A neighbouring month's day in the grid moves the month too
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(screen.getByRole('heading', { name: '2026-11' })).toBeInTheDocument();
    expect(dayButton('2026-11-24')).toHaveFocus();

    fireEvent.click(dayButton('2026-11-24'));
    expect(onOpenDay).toHaveBeenCalledWith('2026-11-24');
  });

  it("makes the month's first day tabbable when the focused day isn't shown", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(dayButton('2026-11-01')).toHaveAttribute('tabindex', '0');
  });
});
