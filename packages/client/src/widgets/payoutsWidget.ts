/**
 * The Payouts widget's part of the snapshot: the next withdrawal (how much,
 * when it opens) and the next release under it, or, until a withdrawal is
 * recorded, the next release itself; and the next few release days, which a
 * tall widget lists.
 *
 * The text is as of now, and the phone shows it long after. So it also says
 * how the figures move with time, for the phone to follow on its own clock:
 * each release day's parts (dropped as they're released), and what the next
 * withdrawal takes with each release after it opens (`growth`).
 */

import type { WidgetMoneyStep, WidgetPayouts } from '../backend/types';
import type { PayoutData } from '../hooks/usePayoutData';
import { parseDateStringLocal } from '../utils/dateHelpers';
import { formatWeekdayDate, formatWeekdayDateTime } from '../utils/locale';
import { endOfReleaseMinute, withdrawableCurve } from '../utils/withdrawals';
import { widgetMoney } from './widgetText';

/** How many release days a tall widget lists. */
export const WIDGET_RELEASES = 3;
/** How many releases after the opening the next withdrawal follows. */
export const WIDGET_GROWTH_STEPS = 12;

/** Money at a time, before it's put the way the phone adds it up. */
interface Amount {
  atMs: number;
  actualCents: number;
  estimatedCents: number;
}

/**
 * Amounts as the phone adds them up, one after another in this order: each
 * gets the cents that make the phone's running total the true one. Exact
 * where none is an estimate. With an estimate among them, every running
 * total goes in whole dollars: a running timer's estimate grows every second,
 * and the widgets' text changes no more often than their whole dollars do.
 * It's the total that is rounded, not each amount, whose remainders would
 * add up (three of $2.40 made $6, not $7; amounts under 50¢ vanished).
 */
function moneySteps(amounts: readonly Amount[]): WidgetMoneyStep[] {
  const whole = amounts.some(amount => amount.estimatedCents > 0);
  let total = 0;
  let sent = 0;
  return amounts.map(({ atMs, actualCents, estimatedCents }) => {
    total += actualCents + estimatedCents;
    const upTo = whole ? Math.round(total / 100) * 100 : total;
    const cents = upTo - sent;
    sent = upTo;
    return { atMs: endOfReleaseMinute(atMs), cents, estimated: estimatedCents > 0 };
  });
}

/**
 * The schedule's next release days (soonest first), each day's money added
 * up. A day all released by `heldUntilMs` (the next withdrawal's opening,
 * null when it's open or there's none) is held: that withdrawal takes it.
 */
function releaseDays(schedule: PayoutData['schedule'], heldUntilMs: number | null): WidgetPayouts['releases'] {
  const days = new Map<string, { cents: number; estimated: boolean; held: boolean; rows: Amount[] }>();
  for (const row of schedule) {
    const day = days.get(row.releaseDay) ?? { cents: 0, estimated: false, held: heldUntilMs !== null, rows: [] };
    if (!days.has(row.releaseDay) && days.size === WIDGET_RELEASES) break;
    day.cents += row.actualCents + row.estimatedCents;
    day.estimated ||= row.estimatedCents > 0;
    day.held &&= heldUntilMs !== null && row.releaseMs <= heldUntilMs;
    day.rows.push({ atMs: row.releaseMs, actualCents: row.actualCents, estimatedCents: row.estimatedCents });
    days.set(row.releaseDay, day);
  }
  return [...days].map(([releaseDay, { cents, estimated, held, rows }]) => ({
    day: formatWeekdayDate(parseDateStringLocal(releaseDay)),
    amount: widgetMoney(cents, estimated),
    held,
    // The phone adds up what's left of a day, so its totals run from the day's last part back
    parts: moneySteps([...rows].reverse()).reverse(),
  }));
}

/** What the next withdrawal takes at its opening, and with each release after it. */
function growthOf(
  plan: NonNullable<PayoutData['plan']>,
  events: PayoutData['events']
): NonNullable<WidgetPayouts['growth']> {
  const { steps } = withdrawableCurve(events, Date.parse(plan.last.takenAt));
  // One step per release minute, as Payouts has one row
  const byMinute = new Map<number, Amount>();
  for (const step of steps) {
    if (step.atMs <= plan.opensAtMs) continue;
    const atMs = endOfReleaseMinute(step.atMs);
    const minute = byMinute.get(atMs) ?? { atMs, actualCents: 0, estimatedCents: 0 };
    byMinute.set(atMs, minute);
    minute.actualCents += step.actualCents;
    minute.estimatedCents += step.estimatedCents;
  }
  // The phone adds each step that has passed to the opening's amount
  const [base, ...later] = moneySteps([
    { atMs: plan.opensAtMs, actualCents: plan.next.actualCents, estimatedCents: plan.next.estimatedCents },
    ...[...byMinute.values()].slice(0, WIDGET_GROWTH_STEPS),
  ]);
  return { cents: base.cents, estimated: base.estimated, steps: later };
}

/** A release day as the widget names it: "Wed, Nov 18", "Wed, Nov 18 (held)". */
const heldDay = ({ day, held }: { day: string; held: boolean }) => (held ? `${day} (held)` : day);

export function payoutsWidget(payout: Pick<PayoutData, 'plan' | 'schedule' | 'events'>): WidgetPayouts | null {
  const { plan } = payout;
  const releases = releaseDays(payout.schedule, plan && !plan.isOpen ? plan.opensAtMs : null);
  const [next] = releases;

  if (plan) {
    return {
      label: 'Next withdrawal',
      amount: widgetMoney(plan.next.totalCents, plan.next.estimatedCents > 0),
      status: plan.isOpen ? 'Ready to withdraw' : `Opens ${formatWeekdayDateTime(plan.opensAtMs)}`,
      isOpen: plan.isOpen,
      opensAtMs: plan.isOpen ? null : plan.opensAtMs,
      nextRelease: next ? `Next release ${heldDay(next)} · ${next.amount}` : null,
      hint: null,
      releases,
      growth: growthOf(plan, payout.events),
    };
  }
  if (!next) return null;
  return {
    label: 'Next release',
    amount: next.amount,
    status: next.day,
    isOpen: false,
    opensAtMs: null,
    nextRelease: null,
    hint: 'Record a withdrawal to plan the next one.',
    releases,
    growth: null,
  };
}
