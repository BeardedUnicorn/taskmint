import { describe, expect, it } from 'vitest';
import { ScheduledWithdrawal, Withdrawal } from '../../types/withdrawal';
import { ReleaseEvent } from '../payoutCalculator';
import {
  DAY_MS,
  classifyRelease,
  curveAt,
  heldUntilMs,
  planReminder,
  planWithdrawals,
  scheduledFor,
  withdrawableAt,
  withdrawableCurve,
  withdrawalBefore,
  withdrawalTooClose,
} from '../withdrawals';

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
    expect(plan?.allowedAtMs).toBe(W + INTERVAL);
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
    // The wait itself still ended when it did
    expect(later?.allowedAtMs).toBe(before + INTERVAL);
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

describe('scheduling the next withdrawal', () => {
  const INTERVAL = 3 * DAY_MS;
  const OPENS = W + INTERVAL;
  const events = [
    imported(W + HOUR, 1000, 'Pending Approval', W - DAY_MS),
    imported(OPENS + DAY_MS, 2000, 'Pending Approval', W - DAY_MS),
    estimate(OPENS + 2 * DAY_MS, 500),
  ];
  const plan = planWithdrawals(events, [withdrawal('w', W)], INTERVAL, NOW);

  function scheduled(releaseMs: number, createdAtMs = NOW): ScheduledWithdrawal {
    return { id: 's1', releaseAt: new Date(releaseMs).toISOString(), createdAt: new Date(createdAtMs).toISOString() };
  }

  it('holds releases until withdrawals open, and none once they are', () => {
    expect(heldUntilMs(plan)).toBe(OPENS);
    expect(heldUntilMs(planWithdrawals(events, [withdrawal('w', W)], INTERVAL, OPENS))).toBeNull();
    expect(heldUntilMs(null)).toBeNull();
  });

  it('is ready when withdrawals open for a held release, with what the opening takes', () => {
    expect(scheduledFor(W + HOUR, plan, events)).toEqual({
      releaseMs: W + HOUR,
      dueMs: OPENS,
      isHeld: true,
      amount: { actualCents: 1000, estimatedCents: 0, pastDueCents: 0, totalCents: 1000 },
    });
  });

  it('is ready at a later release, with everything released since the last withdrawal', () => {
    expect(scheduledFor(OPENS + 2 * DAY_MS, plan, events)).toEqual({
      releaseMs: OPENS + 2 * DAY_MS,
      dueMs: OPENS + 2 * DAY_MS,
      isHeld: false,
      amount: { actualCents: 3000, estimatedCents: 500, pastDueCents: 0, totalCents: 3500 },
    });
  });

  it('is ready at the release, with no amount, until a withdrawal is recorded', () => {
    expect(scheduledFor(W + HOUR, null, events)).toEqual({
      releaseMs: W + HOUR,
      dueMs: W + HOUR,
      isHeld: false,
      amount: null,
    });
  });

  it('works the schedule out against the plan', () => {
    expect(planReminder(null, plan, events)).toBeNull();
    expect(planReminder(scheduled(W + HOUR), plan, events)).toMatchObject({ id: 's1', dueMs: OPENS, isHeld: true });
    expect(planReminder(scheduled(W + HOUR), null, events)).toMatchObject({ id: 's1', dueMs: W + HOUR });
  });

  it('follows a change to the wait between withdrawals', () => {
    const longer = planWithdrawals(events, [withdrawal('w', W)], 5 * DAY_MS, NOW);
    expect(planReminder(scheduled(OPENS + DAY_MS), longer, events)).toMatchObject({
      dueMs: W + 5 * DAY_MS,
      isHeld: true,
    });
  });

  it('is done once a withdrawal is made after it was scheduled', () => {
    const since = planWithdrawals(events, [withdrawal('w', W), withdrawal('next', NOW + HOUR)], INTERVAL, NOW + HOUR);
    expect(planReminder(scheduled(OPENS + DAY_MS), since, events)).toBeNull();
    // One made before it was scheduled (recorded late) leaves it
    const recordedLate = planWithdrawals(events, [withdrawal('w', W)], INTERVAL, NOW);
    expect(planReminder(scheduled(OPENS + DAY_MS, NOW), recordedLate, events)).not.toBeNull();
  });
});

/** withdrawableAt as it was before the curve: the curve must agree with it everywhere. */
function referenceWithdrawableAt(events: ReleaseEvent[], cutoffMs: number | null, atMs: number) {
  let actualCents = 0;
  let estimatedCents = 0;
  let pastDueCents = 0;
  const afterCutoff = (ms: number) => cutoffMs === null || ms > cutoffMs;
  for (const event of events) {
    if (event.status === undefined) {
      if (event.releaseMs <= atMs && afterCutoff(event.releaseMs)) estimatedCents += event.estimatedCents;
      continue;
    }
    if (event.status.trim().toLowerCase() === 'paid') continue;
    const reportedSince = event.reportedMs !== undefined && afterCutoff(event.reportedMs);
    if (event.status.trim().toLowerCase() === 'untransferred') {
      if (cutoffMs === null || reportedSince) actualCents += event.actualCents;
      continue;
    }
    if (event.releaseMs > atMs || !(reportedSince || afterCutoff(event.releaseMs))) continue;
    actualCents += event.actualCents;
    if (event.reportedMs !== undefined && event.reportedMs > event.releaseMs) pastDueCents += event.actualCents;
  }
  return { actualCents, estimatedCents, pastDueCents, totalCents: actualCents + estimatedCents };
}

/** A small seeded PRNG (mulberry32), so a failure can be replayed. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('withdrawableCurve', () => {
  it('agrees with withdrawableAt at every release, either side of it, for any cutoff', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = random(seed);
      const pick = <T>(items: T[]) => items[Math.floor(next() * items.length)];
      // Times on a coarse grid, so releases, reports and the cutoff often coincide
      const time = () => W + Math.round((next() - 0.5) * 10) * HOUR;
      const events = Array.from({ length: 1 + Math.floor(next() * 12) }, () => {
        const status = pick([undefined, 'Paid', ' untransferred ', 'Untransferred', 'Pending Approval']);
        const releaseMs = next() < 0.05 ? Number.NaN : time();
        const cents = 1 + Math.floor(next() * 1000);
        return status === undefined
          ? estimate(releaseMs, cents)
          : event({ releaseMs, actualCents: cents, status, reportedMs: next() < 0.2 ? undefined : time() });
      });
      const cutoffMs = next() < 0.25 ? null : time();
      const curve = withdrawableCurve(events, cutoffMs);
      const times = events.flatMap(e => [e.releaseMs - 1, e.releaseMs, e.releaseMs + 1]).filter(Number.isFinite);
      for (const atMs of [...times, W - 100 * HOUR, W + 100 * HOUR]) {
        expect(curveAt(curve, atMs), `seed ${seed} at ${atMs}`).toEqual(
          referenceWithdrawableAt(events, cutoffMs, atMs)
        );
        expect(withdrawableAt(events, cutoffMs, atMs)).toEqual(referenceWithdrawableAt(events, cutoffMs, atMs));
      }
    }
  });

  it('carries the balance, and steps up at each release time, once per time', () => {
    const curve = withdrawableCurve(
      [
        imported(W - DAY_MS, 300, 'Untransferred', W + HOUR),
        imported(W + HOUR, 200, 'Pending Approval', W + 2 * HOUR),
        estimate(W + HOUR, 50),
        imported(W + 2 * HOUR, 400, 'Pending Approval', W - DAY_MS),
        imported(W + 3 * HOUR, 999, 'Paid', W + 4 * HOUR),
      ],
      W
    );
    expect(curve).toEqual({
      carried: { actualCents: 300, estimatedCents: 0, pastDueCents: 0 },
      steps: [
        { atMs: W + HOUR, actualCents: 200, estimatedCents: 50, pastDueCents: 200 },
        { atMs: W + 2 * HOUR, actualCents: 400, estimatedCents: 0, pastDueCents: 0 },
      ],
    });
    expect(curveAt(curve, W).totalCents).toBe(300);
    expect(curveAt(curve, W + HOUR).totalCents).toBe(550);
    expect(curveAt(curve, W + DAY_MS).totalCents).toBe(950);
  });

  it('classifies a release whose time didn’t parse as the old math counted it', () => {
    const lost = Number.NaN;
    expect(classifyRelease(estimate(lost, 10), null)).toBe('never');
    // A pending import with no release time counts in any withdrawal (it isn't "later" than one)
    expect(classifyRelease(imported(lost, 10, 'Pending Approval', W + HOUR), W)).toBe('carried');
    expect(classifyRelease(imported(lost, 10, 'Pending Approval', W - HOUR), W)).toBe('never');
    expect(classifyRelease(imported(W - HOUR, 10, 'Pending Approval', W - 2 * HOUR), W)).toBe('never');
    expect(classifyRelease(imported(W + HOUR, 10, 'Paid', W + 2 * HOUR), null)).toBe('never');
  });
});
