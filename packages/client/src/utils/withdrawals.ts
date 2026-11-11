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
 *
 * A release before the next withdrawal opens is held: it can't be taken out
 * until the opening. A withdrawal scheduled for a release is due at the
 * release, or at the opening when the release is held (planReminder).
 */

import { ScheduledWithdrawal, Withdrawal } from '../types/withdrawal';
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

/** How a release counts toward the withdrawals after a cutoff. */
export type ReleaseCount =
  /** Never: Paid, taken by the cutoff's withdrawal, or (an estimate) released by it. */
  | 'never'
  /** In every withdrawal after the cutoff until one takes it: Untransferred money on the balance. */
  | 'carried'
  /** From its release time on. */
  | 'atRelease';

/** How `event` counts toward the withdrawals after the one at `cutoffMs` (null: none recorded). */
export function classifyRelease(event: ReleaseEvent, cutoffMs: number | null): ReleaseCount {
  const afterCutoff = (ms: number) => cutoffMs === null || ms > cutoffMs;
  // A release whose time didn't parse: an estimate's never comes, an import's is no later than any withdrawal
  const timed = !Number.isNaN(event.releaseMs);
  if (event.status === undefined) {
    // An estimate: tracked time released since the cutoff
    return timed && afterCutoff(event.releaseMs) ? 'atRelease' : 'never';
  }
  if (isPaid(event.status)) return 'never';
  // What the site said since the cutoff is the truth about it
  const reportedSince = event.reportedMs !== undefined && afterCutoff(event.reportedMs);
  if (isUntransferred(event.status)) {
    // On the balance: the withdrawal at the cutoff took it, unless the site still showed it after
    return cutoffMs === null || reportedSince ? 'carried' : 'never';
  }
  // Still pending: counts once released, unless the cutoff's withdrawal took it (and the site hasn't held it since)
  if (!(reportedSince || afterCutoff(event.releaseMs))) return 'never';
  return timed ? 'atRelease' : 'carried';
}

/** Money a withdrawal can take, by kind. */
export interface CurveAmount {
  actualCents: number;
  estimatedCents: number;
  /** Part of actualCents: imports the site still listed as pending after their release time. */
  pastDueCents: number;
}

export interface CurveStep extends CurveAmount {
  /** When it becomes withdrawable (its release). */
  atMs: number;
}

/**
 * What the withdrawals after a cutoff can take, as time goes on: `carried`
 * from the start, then each step from its time. A withdrawal at `t` takes
 * curveAt(curve, t); one after it at `t2` takes what the curve adds between
 * them. Nothing in it depends on the clock, so it can be stored and shared.
 */
export interface WithdrawableCurve {
  carried: CurveAmount;
  /** Soonest first, one per release time. */
  steps: CurveStep[];
}

const noMoney = (): CurveAmount => ({ actualCents: 0, estimatedCents: 0, pastDueCents: 0 });

/** Adds `event`'s money to `amount`: a pending import the site reported after its release is past due. */
export function addRelease(amount: CurveAmount, event: ReleaseEvent): void {
  amount.actualCents += event.actualCents;
  amount.estimatedCents += event.estimatedCents;
  const pending = event.status !== undefined && !isUntransferred(event.status);
  if (pending && event.reportedMs !== undefined && event.reportedMs > event.releaseMs) {
    amount.pastDueCents += event.actualCents;
  }
}

/** The curve of what the withdrawals after the one at `cutoffMs` take (null: none recorded). */
export function withdrawableCurve(events: ReleaseEvent[], cutoffMs: number | null): WithdrawableCurve {
  const carried = noMoney();
  const byTime = new Map<number, CurveStep>();
  for (const event of events) {
    const count = classifyRelease(event, cutoffMs);
    if (count === 'never') continue;
    if (count === 'carried') {
      addRelease(carried, event);
      continue;
    }
    let step = byTime.get(event.releaseMs);
    if (!step) {
      step = { atMs: event.releaseMs, ...noMoney() };
      byTime.set(event.releaseMs, step);
    }
    addRelease(step, event);
  }
  return { carried, steps: [...byTime.values()].sort((a, b) => a.atMs - b.atMs) };
}

/** What a withdrawal at `atMs` takes, on `curve`. */
export function curveAt(curve: WithdrawableCurve, atMs: number): WithdrawableAmount {
  const sum = { ...curve.carried };
  for (const step of curve.steps) {
    if (step.atMs > atMs) break;
    sum.actualCents += step.actualCents;
    sum.estimatedCents += step.estimatedCents;
    sum.pastDueCents += step.pastDueCents;
  }
  return { ...sum, totalCents: sum.actualCents + sum.estimatedCents };
}

/**
 * What a withdrawal at `atMs` takes, after the withdrawal at `cutoffMs`
 * (null: none recorded, so everything not Paid that's released by then).
 */
export function withdrawableAt(events: ReleaseEvent[], cutoffMs: number | null, atMs: number): WithdrawableAmount {
  return curveAt(withdrawableCurve(events, cutoffMs), atMs);
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
  /** When the wait after the latest withdrawal ends (it may have passed). */
  allowedAtMs: number;
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
    allowedAtMs,
    opensAtMs,
    isOpen: nowMs >= allowedAtMs,
    next,
    availableNow: withdrawableAt(events, cutoffMs, nowMs),
    ifYouWait,
  };
}

/** Until when releases are held (they can't be taken out before it); null while withdrawals are open. */
export function heldUntilMs(plan: WithdrawalPlan | null): number | null {
  return plan && !plan.isOpen ? plan.allowedAtMs : null;
}

/** A withdrawal scheduled for a release: when it's ready, and what it takes then. */
export interface ScheduledFor {
  /** The release it waits for. */
  releaseMs: number;
  /** When it's ready: the release, or the opening when the release is held. */
  dueMs: number;
  /** The release lands before withdrawals open, so it waits for the opening. */
  isHeld: boolean;
  /** What the withdrawal takes then; null with no withdrawal recorded (nothing to count from). */
  amount: WithdrawableAmount | null;
}

/** A withdrawal scheduled for the release at `releaseMs`, against the plan. */
export function scheduledFor(releaseMs: number, plan: WithdrawalPlan | null, events: ReleaseEvent[]): ScheduledFor {
  if (plan === null) return { releaseMs, dueMs: releaseMs, isHeld: false, amount: null };
  const isHeld = releaseMs < plan.allowedAtMs;
  const dueMs = isHeld ? plan.allowedAtMs : releaseMs;
  return { releaseMs, dueMs, isHeld, amount: withdrawableAt(events, takenAtMs(plan.last), dueMs) };
}

export interface WithdrawalReminder extends ScheduledFor {
  /** The schedule's id. */
  id: string;
}

/**
 * The scheduled withdrawal, worked out against the plan. Null when none is
 * scheduled, or when a withdrawal has been made since it was (that was the
 * one it was for).
 */
export function planReminder(
  scheduled: ScheduledWithdrawal | null,
  plan: WithdrawalPlan | null,
  events: ReleaseEvent[]
): WithdrawalReminder | null {
  if (scheduled === null) return null;
  if (plan && takenAtMs(plan.last) >= Date.parse(scheduled.createdAt)) return null;
  return { id: scheduled.id, ...scheduledFor(Date.parse(scheduled.releaseAt), plan, events) };
}
