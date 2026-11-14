/**
 * The Payouts widget's part of the snapshot: the next withdrawal (how much,
 * when it opens) and the next release under it, or, until a withdrawal is
 * recorded, the next release itself; and the next few release days, which a
 * tall widget lists.
 */

import type { WidgetPayouts } from '../backend/types';
import type { PayoutData } from '../hooks/usePayoutData';
import { parseDateStringLocal } from '../utils/dateHelpers';
import { formatWeekdayDate, formatWeekdayDateTime } from '../utils/locale';
import { widgetMoney } from './widgetText';

/** How many release days a tall widget lists. */
export const WIDGET_RELEASES = 3;

/** The schedule's next release days (soonest first), each day's money added up. */
function releaseDays(schedule: PayoutData['schedule']): { day: string; amount: string }[] {
  const days = new Map<string, { cents: number; estimated: boolean }>();
  for (const row of schedule) {
    const day = days.get(row.releaseDay) ?? { cents: 0, estimated: false };
    if (!days.has(row.releaseDay) && days.size === WIDGET_RELEASES) break;
    day.cents += row.actualCents + row.estimatedCents;
    day.estimated ||= row.estimatedCents > 0;
    days.set(row.releaseDay, day);
  }
  return [...days].map(([releaseDay, { cents, estimated }]) => ({
    day: formatWeekdayDate(parseDateStringLocal(releaseDay)),
    amount: widgetMoney(cents, estimated),
  }));
}

export function payoutsWidget(payout: Pick<PayoutData, 'plan' | 'schedule'>): WidgetPayouts | null {
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
  };
}
