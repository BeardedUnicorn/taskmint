/**
 * Home's figures for today and this week: the same per-day money and time
 * the Calendar shows (imported site amounts where there are any, estimates
 * from tracked time otherwise), added up over a run of days. Pure.
 */

import { Dayjs } from 'dayjs';
import { PayoutDayCell } from '../../../utils/payoutCalculator';
import { presetRange } from '../../../utils/dateRanges';
import { cellTimeMs } from '../calendar/calendarMonth';

export interface PeriodTotals {
  /** Imported and estimated money. */
  earnedCents: number;
  /** The part of earnedCents that's estimated. */
  estimatedCents: number;
  timeMs: number;
}

/** What the cells for the days `from`..`to` (YYYY-MM-DD, inclusive) add up to. */
export function periodTotals(cells: PayoutDayCell[], from: string, to: string): PeriodTotals {
  const totals: PeriodTotals = { earnedCents: 0, estimatedCents: 0, timeMs: 0 };
  for (const cell of cells) {
    if (cell.workDay < from || cell.workDay > to) continue;
    totals.earnedCents += cell.actualCents + cell.estimatedCents;
    totals.estimatedCents += cell.estimatedCents;
    totals.timeMs += cellTimeMs(cell);
  }
  return totals;
}

/** The first and last day (YYYY-MM-DD) of the week `today` is in, as History's "This week" has it. */
export function thisWeek(today: Dayjs): { from: string; to: string } {
  const { start, end } = presetRange('thisWeek', today);
  return { from: start!.format('YYYY-MM-DD'), to: end!.format('YYYY-MM-DD') };
}
