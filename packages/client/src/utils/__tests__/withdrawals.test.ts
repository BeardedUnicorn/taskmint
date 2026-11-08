import { describe, expect, it } from 'vitest';
import { Withdrawal } from '../../types/withdrawal';
import { ReleaseEvent } from '../payoutCalculator';
import { DAY_MS, planWithdrawals, withdrawableAt, withdrawalBefore, withdrawalTooClose } from '../withdrawals';

const HOUR = 3_600_000;
// A withdrawal on Nov 7 at noon (local), and "now" a day later
const W = new Date(2026, 10, 7, 12, 0).getTime();
const NOW = W + DAY_MS;

function event(overrides: Partial<ReleaseEvent> & { releaseMs: number }): ReleaseEvent {
  return {
    releaseDay: '2026-11-07',
    actualCents: 0,
    estimatedCents: 0,
    taskId: 'task-1',
    taskName: 'Wolverine',
    workDay: '2026-10-31',
    ...overrides,
  };
}

/** An imported entry the site last reported at `reportedMs`. */
function imported(releaseMs: number, cents: number, status: string, reportedMs: number): ReleaseEvent {
  return event({ releaseMs, actualCents: cents, status, reportedMs });
}

function estimate(releaseMs: number, cents: number): ReleaseEvent {
  return event({ releaseMs, estimatedCents: cents });
}

function withdrawal(id: string, takenAtMs: number, amountCents = 10_000): Withdrawal {
  const iso = new Date(takenAtMs).toISOString();
  return { id, takenAt: iso, amountCents, createdAt: iso, updatedAt: iso };
}

describe('withdrawableAt', () => {
  it('never counts what the site paid out', () => {
    expect(withdrawableAt([imported(W + HOUR, 500, 'Paid', NOW)], W, NOW).totalCents).toBe(0);
    expect(withdrawableAt([imported(W - HOUR, 500, 'Paid', NOW)], null, NOW).totalCents).toBe(0);
  });

  it('counts the balance the site showed after the withdrawal, not the one it took', () => {
    const stillThere = imported(W - DAY_MS, 300, 'Untransferred', W + HOUR);
    const taken = imported(W - DAY_MS, 700, 'Untransferred', W - HOUR);
    const neverReported = event({ releaseMs: W - DAY_MS, actualCents: 900, status: 'Untransferred' });
    expect(withdrawableAt([stillThere, taken, neverReported], W, NOW)).toEqual({
      actualCents: 300,
      estimatedCents: 0,
      pastDueCents: 0,
      totalCents: 300,
    });
    // With no withdrawal recorded, the whole balance counts
    expect(withdrawableAt([stillThere, taken, neverReported], null, NOW).actualCents).toBe(1900);
  });

  it('counts pending money released after the withdrawal and by then', () => {
    const before = imported(W - HOUR, 100, 'Pending Approval', W - 2 * DAY_MS);
    const between = imported(W + HOUR, 200, 'Pending Approval', W - 2 * DAY_MS);
    const later = imported(NOW + HOUR, 400, 'Pending Approval', W - 2 * DAY_MS);
    expect(withdrawableAt([before, between, later], W, NOW).actualCents).toBe(200);
    expect(withdrawableAt([before, between, later], W, NOW + HOUR).actualCents).toBe(600);
    expect(withdrawableAt([before, between, later], null, NOW).actualCents).toBe(300);
  });

  it("keeps pending money the site still held after the withdrawal, and flags it once it's past due", () => {
    // Due before the withdrawal, still pending at an import after it: not taken
    const late = imported(W - HOUR, 800, 'Pending Approval', W + HOUR);
    // Reported after the withdrawal but before its release: on schedule, not past due
    const onTime = imported(W + 2 * HOUR, 50, 'Pending Approval', W + HOUR);
    expect(withdrawableAt([late, onTime], W, NOW)).toEqual({
      actualCents: 850,
      estimatedCents: 0,
      pastDueCents: 800,
      totalCents: 850,
    });
  });

  it('counts estimates released after the withdrawal and by then', () => {
    const events = [estimate(W - HOUR, 1000), estimate(W + HOUR, 2000), estimate(NOW + HOUR, 4000)];
    expect(withdrawableAt(events, W, NOW)).toEqual({
      actualCents: 0,
      estimatedCents: 2000,
      pastDueCents: 0,
      totalCents: 2000,
    });
    expect(withdrawableAt(events, null, NOW).estimatedCents).toBe(3000);
  });
});

describe('withdrawalBefore and withdrawalTooClose', () => {
  const list = [withdrawal('a', W - 4 * DAY_MS), withdrawal('b', W), withdrawal('c', W - 8 * DAY_MS)];

  it('finds the latest withdrawal strictly before a time, skipping one', () => {
    expect(withdrawalBefore(list, W)?.id).toBe('a');
    expect(withdrawalBefore(list, W + 1)?.id).toBe('b');
    expect(withdrawalBefore(list, W + 1, 'b')?.id).toBe('a');
    expect(withdrawalBefore(list, W - 8 * DAY_MS)).toBeNull();
  });

  it('finds another withdrawal inside the interval, either side', () => {
    expect(withdrawalTooClose(list, W + 2 * DAY_MS, 3 * DAY_MS)?.id).toBe('b');
    expect(withdrawalTooClose(list, W - 2 * DAY_MS, 3 * DAY_MS, 'a')?.id).toBe('b');
    expect(withdrawalTooClose(list, W + 3 * DAY_MS, 3 * DAY_MS)).toBeNull();
  });
});

describe('planWithdrawals', () => {
  const INTERVAL = 3 * DAY_MS;

  it('has nothing to say until a withdrawal is recorded', () => {
    expect(planWithdrawals([estimate(W, 100)], [], INTERVAL, NOW)).toBeNull();
  });

  it('opens the interval after the last withdrawal, with what will be released by then', () => {
    const events = [
      imported(W + HOUR, 1000, 'Pending Approval', W - DAY_MS),
      imported(NOW + HOUR, 2000, 'Pending Approval', W - DAY_MS),
      estimate(W + INTERVAL + HOUR, 4000), // after the opening
    ];
    const plan = planWithdrawals(events, [withdrawal('old', W - 9 * DAY_MS), withdrawal('last', W)], INTERVAL, NOW);
    expect(plan?.last.id).toBe('last');
    expect(plan?.opensAtMs).toBe(W + INTERVAL);
    expect(plan?.isOpen).toBe(false);
    expect(plan?.next.totalCents).toBe(3000);
    expect(plan?.availableNow.totalCents).toBe(1000);
    expect(plan?.ifYouWait).toEqual([
      { atMs: W + INTERVAL + HOUR, addedCents: 4000, totalCents: 7000, hasEstimate: true },
    ]);
  });

  it('is open now once the interval has passed, and counts to the minute across a DST change', () => {
    // Nov 1 2026 is the US fall-back day: three days later is still exactly 72 hours
    const before = new Date(2026, 9, 31, 18, 25).getTime();
    const plan = planWithdrawals([], [withdrawal('w', before)], INTERVAL, before + INTERVAL);
    expect(plan?.opensAtMs).toBe(before + 72 * HOUR);
    expect(plan?.isOpen).toBe(true);
    const later = planWithdrawals([], [withdrawal('w', before)], INTERVAL, before + INTERVAL + DAY_MS);
    expect(later?.opensAtMs).toBe(before + INTERVAL + DAY_MS);
  });

  it('lists what waiting adds, skipping releases that add nothing, at most six', () => {
    const opens = W + INTERVAL;
    const events = [
      // Already paid: adds nothing
      imported(opens + HOUR, 999, 'Paid', NOW),
      ...Array.from({ length: 8 }, (_, i) => imported(opens + (i + 2) * HOUR, 100, 'Pending Approval', W - DAY_MS)),
      // Past the week after the opening
      imported(opens + 8 * DAY_MS, 100, 'Pending Approval', W - DAY_MS),
    ];
    const plan = planWithdrawals(events, [withdrawal('w', W)], INTERVAL, NOW);
    expect(plan?.ifYouWait).toHaveLength(6);
    expect(plan?.ifYouWait[0]).toEqual({
      atMs: opens + 2 * HOUR,
      addedCents: 100,
      totalCents: 100,
      hasEstimate: false,
    });
    expect(plan?.ifYouWait[5].totalCents).toBe(600);
  });
});
