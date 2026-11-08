/**
 * Withdrawals: when the next one opens, and how much it will be.
 *
 * The payment site allows one withdrawal every `interval`, and a withdrawal
 * takes the whole balance available at that moment. So each recorded
 * withdrawal is a cutoff: what the next one takes is the money released
 * after it (see buildReleaseEvents), up to the moment of the next one.
 *
 * Imports correct the cutoff. An entry the site reported after the last
 * withdrawal carries the truth about it: Untransferred is still on the
 * balance, Paid is gone, and a pending one that was due before the
 * withdrawal wasn't released in time for it, so it's still to come.
 */

import { Withdrawal } from '../types/withdrawal';
import { ReleaseEvent, isPaid, isUntransferred } from './payoutCalculator';

export const DAY_MS = 86_400_000;

/** How far past the opening "If you wait" looks. */
const WAIT_WINDOW_MS = 7 * DAY_MS;
/** At most this many "If you wait" rows. */
const MAX_WAIT_ROWS = 6;

export interface WithdrawableAmount {
  /** Imported money (the site's amounts). */
  actualCents: number;
  /** Tracked time not imported yet, at each timer's rate. */
  estimatedCents: number;
  /**
   * Part of actualCents: imports the site still listed as pending after their
   * release time, so they wait on its approval.
   */
  pastDueCents: number;
  totalCents: number;
}

/**
 * What a withdrawal at `atMs` takes, after the withdrawal at `cutoffMs`
 * (null: none recorded, so everything not Paid that's released by then).
 */
export function withdrawableAt(events: ReleaseEvent[], cutoffMs: number | null, atMs: number): WithdrawableAmount {
  let actualCents = 0;
  let estimatedCents = 0;
  let pastDueCents = 0;
  const afterCutoff = (ms: number) => cutoffMs === null || ms > cutoffMs;

  for (const event of events) {
    if (event.status === undefined) {
      // An estimate: tracked time released since the cutoff
      if (event.releaseMs <= atMs && afterCutoff(event.releaseMs)) estimatedCents += event.estimatedCents;
      continue;
    }
    if (isPaid(event.status)) continue;
    // What the site said since the cutoff is the truth about it
    const reportedSince = event.reportedMs !== undefined && afterCutoff(event.reportedMs);
    if (isUntransferred(event.status)) {
      // On the balance: the withdrawal at the cutoff took it, unless the site still showed it after
      if (cutoffMs === null || reportedSince) actualCents += event.actualCents;
      continue;
    }
    // Still pending: released by then, and not by the cutoff (unless the site still held it after)
    if (event.releaseMs > atMs || !(reportedSince || afterCutoff(event.releaseMs))) continue;
    actualCents += event.actualCents;
    if (event.reportedMs !== undefined && event.reportedMs > event.releaseMs) pastDueCents += event.actualCents;
  }

  return { actualCents, estimatedCents, pastDueCents, totalCents: actualCents + estimatedCents };
}

const takenAtMs = (withdrawal: Withdrawal) => Date.parse(withdrawal.takenAt);

/** The latest withdrawal strictly before `atMs` (other than `excludeId`), or null. */
export function withdrawalBefore(withdrawals: Withdrawal[], atMs: number, excludeId?: string): Withdrawal | null {
  let latest: Withdrawal | null = null;
  for (const withdrawal of withdrawals) {
    if (withdrawal.id === excludeId || takenAtMs(withdrawal) >= atMs) continue;
    if (latest === null || takenAtMs(withdrawal) > takenAtMs(latest)) latest = withdrawal;
  }
  return latest;
}

/** The other withdrawal within `intervalMs` of `atMs` (the site wouldn't allow both), or null. */
export function withdrawalTooClose(
  withdrawals: Withdrawal[],
  atMs: number,
  intervalMs: number,
  excludeId?: string
): Withdrawal | null {
  return (
    withdrawals.find(
      withdrawal => withdrawal.id !== excludeId && Math.abs(takenAtMs(withdrawal) - atMs) < intervalMs
    ) ?? null
  );
}

export interface WaitStep {
  /** A release time after the opening. */
  atMs: number;
  /** What waiting until then adds. */
  addedCents: number;
  /** What the withdrawal would be then. */
  totalCents: number;
  /** Some of what it adds is an estimate. */
  hasEstimate: boolean;
}

export interface WithdrawalPlan {
  /** The latest withdrawal. */
  last: Withdrawal;
  /** When the next withdrawal is allowed (now, when it already is). */
  opensAtMs: number;
  isOpen: boolean;
  /** What the next withdrawal takes at opensAtMs. */
  next: WithdrawableAmount;
  /** What's been released since the last withdrawal, as of now. */
  availableNow: WithdrawableAmount;
  /** Releases in the week after the opening: what waiting until each would add. */
  ifYouWait: WaitStep[];
}

/** The next withdrawal; null until one is recorded (there's nothing to count from). */
export function planWithdrawals(
  events: ReleaseEvent[],
  withdrawals: Withdrawal[],
  intervalMs: number,
  nowMs: number
): WithdrawalPlan | null {
  const last = withdrawalBefore(withdrawals, Number.POSITIVE_INFINITY);
  if (last === null) return null;

  const cutoffMs = takenAtMs(last);
  const allowedAtMs = cutoffMs + intervalMs;
  const opensAtMs = Math.max(nowMs, allowedAtMs);
  const next = withdrawableAt(events, cutoffMs, opensAtMs);

  const ifYouWait: WaitStep[] = [];
  const later = [
    ...new Set(
      events
        .filter(event => event.releaseMs > opensAtMs && event.releaseMs <= opensAtMs + WAIT_WINDOW_MS)
        .map(event => event.releaseMs)
    ),
  ];
  let previous = next;
  for (const atMs of later) {
    if (ifYouWait.length === MAX_WAIT_ROWS) break;
    const then = withdrawableAt(events, cutoffMs, atMs);
    if (then.totalCents === previous.totalCents) continue;
    ifYouWait.push({
      atMs,
      addedCents: then.totalCents - previous.totalCents,
      totalCents: then.totalCents,
      hasEstimate: then.estimatedCents > previous.estimatedCents,
    });
    previous = then;
  }

  return {
    last,
    opensAtMs,
    isOpen: nowMs >= allowedAtMs,
    next,
    availableNow: withdrawableAt(events, cutoffMs, nowMs),
    ifYouWait,
  };
}
