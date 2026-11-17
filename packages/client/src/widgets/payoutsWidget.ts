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

/**
 * Money at a time, as the phone adds it up. An estimate goes in whole
 * dollars: a running timer's grows every second, and the widgets' text
 * changes no more often than their whole dollars do.
 */
function moneyStep(atMs: number, actualCents: number, estimatedCents: number): WidgetMoneyStep {
  const estimated = estimatedCents > 0;
  const cents = actualCents + estimatedCents;
  return { atMs: endOfReleaseMinute(atMs), cents: estimated ? Math.round(cents / 100) * 100 : cents, estimated };
}

/** The schedule's next release days (soonest first), each day's money added up. */
function releaseDays(schedule: PayoutData['schedule']): WidgetPayouts['releases'] {
  const days = new Map<string, { cents: number; estimated: boolean; parts: WidgetMoneyStep[] }>();
  for (const row of schedule) {
    const day = days.get(row.releaseDay) ?? { cents: 0, estimated: false, parts: [] };
    if (!days.has(row.releaseDay) && days.size === WIDGET_RELEASES) break;
    day.cents += row.actualCents + row.estimatedCents;
    day.estimated ||= row.estimatedCents > 0;
    day.parts.push(moneyStep(row.releaseMs, row.actualCents, row.estimatedCents));
    days.set(row.releaseDay, day);
  }
  return [...days].map(([releaseDay, { cents, estimated, parts }]) => ({
    day: formatWeekdayDate(parseDateStringLocal(releaseDay)),
    amount: widgetMoney(cents, estimated),
    parts,
  }));
}

/** What the next withdrawal takes at its opening, and with each release after it. */
function growthOf(
  plan: NonNullable<PayoutData['plan']>,
  events: PayoutData['events']
): NonNullable<WidgetPayouts['growth']> {
  const { steps } = withdrawableCurve(events, Date.parse(plan.last.takenAt));
  const base = moneyStep(plan.opensAtMs, plan.next.actualCents, plan.next.estimatedCents);
  // One step per release minute, as Payouts has one row
  const byMinute = new Map<number, { actualCents: number; estimatedCents: number }>();
  for (const step of steps) {
    if (step.atMs <= plan.opensAtMs) continue;
    const atMs = endOfReleaseMinute(step.atMs);
    const minute = byMinute.get(atMs) ?? { actualCents: 0, estimatedCents: 0 };
    byMinute.set(atMs, minute);
    minute.actualCents += step.actualCents;
    minute.estimatedCents += step.estimatedCents;
  }
  return {
    cents: base.cents,
    estimated: base.estimated,
    steps: [...byMinute]
      .slice(0, WIDGET_GROWTH_STEPS)
      .map(([atMs, { actualCents, estimatedCents }]) => moneyStep(atMs, actualCents, estimatedCents)),
  };
}

export function payoutsWidget(payout: Pick<PayoutData, 'plan' | 'schedule' | 'events'>): WidgetPayouts | null {
  const { plan } = payout;
  const releases = releaseDays(payout.schedule);
  const [next] = releases;

  if (plan) {
    return {
      label: 'Next withdrawal',
      amount: widgetMoney(plan.next.totalCents, plan.next.estimatedCents > 0),
      status: plan.isOpen ? 'Ready to withdraw' : `Opens ${formatWeekdayDateTime(plan.opensAtMs)}`,
      isOpen: plan.isOpen,
      opensAtMs: plan.isOpen ? null : plan.opensAtMs,
      nextRelease: next ? `Next release ${next.day} · ${next.amount}` : null,
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
