/**
 * The published payout forecast. Times are local wall times, so the
 * assertions hold in any host time zone; releases are worked out with dayjs,
 * as the calculator does.
 */

import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkLogEntry } from '../../types/workLog';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
  createMockWorkLogEntry,
} from '../../__tests__/setup/session-test-utils';
import { createMockWithdrawal } from '../../__tests__/setup/payout-test-utils';
import { APP_VERSION } from '../appVersion';
import { formatDateString } from '../dateHelpers';
import { fnv1a64 } from '../fnv';
import { buildPayoutCells, buildReleaseEvents } from '../payoutCalculator';
import {
  MAX_FORECAST_JSON,
  PayoutForecast,
  PayoutInputs,
  buildPayoutForecast,
  deviceZone,
  payoutForecastJson,
  publishedForecast,
} from '../payoutForecast';
import { DAY_MS, withdrawableAt } from '../withdrawals';

const HOUR = 3_600_000;
const ZONE = 'America/Chicago';
// The latest withdrawal: Nov 7 at noon (local)
const W = new Date(2026, 10, 7, 12, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
/** When money the site reported at `createdMs` is released (7 days on, by the calendar). */
const releaseOf = (createdMs: number, days = 7) => dayjs(createdMs).add(days, 'day').valueOf();

/** An entry the site created at `createdMs` (its day's), last reported at `reportedMs`. */
function entry(id: string, createdMs: number, cents: number, status: string, reportedMs: number): WorkLogEntry {
  return createMockWorkLogEntry({
    id,
    createdAt: iso(createdMs),
    workDay: formatDateString(new Date(createdMs)),
    amountCents: cents,
    status,
    importedAt: iso(reportedMs),
    updatedAt: iso(reportedMs),
  });
}

function inputs(overrides: Partial<PayoutInputs> = {}): PayoutInputs {
  return {
    entries: [],
    sessions: [],
    tasks: [createMockTask({ id: 'task-1', hourlyRate: 60 })],
    withdrawals: [],
    scheduled: null,
    fundsReleaseDays: 7,
    withdrawalIntervalDays: 3,
    ...overrides,
  };
}

/** What a withdrawal at `atMs` takes, read off the forecast as BudgetMint reads it. */
function forecastAt(forecast: PayoutForecast, atMs: number) {
  const sum = { ...forecast.carried };
  for (const step of forecast.steps) {
    if (step.atMs > atMs) continue;
    sum.actualCents += step.actualCents;
    sum.estimatedCents += step.estimatedCents;
    sum.pastDueCents += step.pastDueCents;
  }
  return { ...sum, totalCents: sum.actualCents + sum.estimatedCents };
}

afterEach(() => vi.useRealTimers());

describe('buildPayoutForecast', () => {
  it('is empty, and says so, with nothing tracked or imported', () => {
    expect(buildPayoutForecast(inputs(), ZONE)).toEqual({
      schema: 1,
      asOfMs: 0,
      fundsReleaseDays: 7,
      withdrawalIntervalMs: 3 * DAY_MS,
      lastImportMs: null,
      cutoff: null,
      recentWithdrawals: [],
      nextAllowedAtMs: null,
      scheduled: null,
      carried: { actualCents: 0, estimatedCents: 0, pastDueCents: 0 },
      steps: [],
      recentDays: [],
      zone: ZONE,
    });
  });

  // Reported at W + 1h (the latest import, so "as of"); the site's numbers after the withdrawal at W
  const reported = W + HOUR;
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
  const created = {
    kept: at(29, 12),
    released: at(31, 12, 30),
    late: at(30, 12),
    soon: at(36, 12),
    later: at(37, 12),
  };
  const ledger = [
    // On the balance after the withdrawal: carried
    entry('kept', created.kept, 300, 'Untransferred', reported),
    // Taken by the withdrawal (the site last showed it before): never
    entry('taken', created.kept, 700, 'Untransferred', W - HOUR),
    // Released after the withdrawal (12:30) and before the import: carried, past due by the import
    entry('released', created.released, 400, 'Pending Approval', reported),
    // Due before the withdrawal, still pending after it: past due, carried
    entry('late', created.late, 500, 'Pending Approval', reported),
    // Still to come: steps
    entry('soon', created.soon, 1000, 'Pending Approval', reported),
    entry('later', created.later, 2000, 'Pending Approval', reported),
    entry('paid', created.later, 9999, 'Paid', reported),
  ];
  const withdrawal = createMockWithdrawal({ takenAt: iso(W), amountCents: 5000 });

  it('carries what any withdrawal from now on takes, and steps up at each release to come', () => {
    const forecast = buildPayoutForecast(inputs({ entries: ledger, withdrawals: [withdrawal] }), ZONE);
    expect(forecast).toMatchObject({
      asOfMs: reported,
      lastImportMs: reported,
      cutoff: { takenAtMs: W, amountCents: 5000 },
      nextAllowedAtMs: W + 3 * DAY_MS,
      carried: { actualCents: 1200, estimatedCents: 0, pastDueCents: 900 },
      steps: [
        { atMs: releaseOf(created.soon), actualCents: 1000, estimatedCents: 0, pastDueCents: 0 },
        { atMs: releaseOf(created.later), actualCents: 2000, estimatedCents: 0, pastDueCents: 0 },
      ],
    });
  });

  it('agrees with TaskMint’s withdrawableAt at any time from when it was written', () => {
    const forecast = buildPayoutForecast(inputs({ entries: ledger, withdrawals: [withdrawal] }), ZONE);
    const cells = buildPayoutCells(ledger, [], inputs().tasks, 7, reported);
    const events = buildReleaseEvents(cells, ledger, 7);
    for (const atMs of [reported, W + 3 * DAY_MS, ...forecast.steps.map(step => step.atMs), W + 30 * DAY_MS]) {
      expect(forecastAt(forecast, atMs)).toEqual(withdrawableAt(events, W, atMs));
    }
  });

  it('counts everything not Paid with no withdrawal recorded', () => {
    const forecast = buildPayoutForecast(inputs({ entries: ledger }), ZONE);
    expect(forecast).toMatchObject({ cutoff: null, nextAllowedAtMs: null, recentWithdrawals: [] });
    expect(forecast.carried.actualCents).toBe(300 + 700 + 400 + 500);
    expect(forecastAt(forecast, W + 30 * DAY_MS).totalCents).toBe(4900);
  });

  it('measures open timers as of their last change, not now, and says how they go on', () => {
    // Running since 9:00, last changed at 9:30; paused yesterday at 15:00 on another task
    const start = new Date(2026, 10, 9, 9, 0).getTime();
    const running = createMockTimerInstance({
      id: 'run',
      isRunning: true,
      startTime: iso(start),
      updatedAt: iso(start + HOUR / 2),
    });
    const pausedStart = new Date(2026, 10, 8, 14, 0).getTime();
    const paused = createMockTimerInstance({
      id: 'pause',
      isPaused: true,
      startTime: iso(pausedStart),
      pausedAt: iso(pausedStart + HOUR),
      updatedAt: iso(pausedStart + HOUR),
      task: { taskId: 'task-2', taskName: 'Other', hourlyRate: 40 },
    });
    const doneStart = new Date(2026, 9, 30, 9, 0).getTime();
    const stopped = createMockTimerInstance({
      id: 'done',
      startTime: iso(doneStart),
      endTime: iso(doneStart + HOUR),
      duration: HOUR,
      updatedAt: iso(doneStart + HOUR),
    });
    const sessions = [createMockTaskSession({ timerInstances: [running, paused, stopped] })];
    const sinceMs = start + HOUR / 2;

    const build = () => payoutForecastJson(buildPayoutForecast(inputs({ sessions }), ZONE));
    vi.useFakeTimers();
    vi.setSystemTime(start + 3 * HOUR);
    const first = build();
    vi.setSystemTime(start + 9 * HOUR);
    // The same bytes later: the clock isn't in it
    expect(build()).toBe(first);

    const forecast = JSON.parse(first) as PayoutForecast;
    expect(forecast.asOfMs).toBe(sinceMs);
    // Open timers last changed at sinceMs: their days go out 7 days after it, until they stop
    const open = (estimatedCents: number, centsPerHour: number) => ({
      atMs: releaseOf(sinceMs),
      actualCents: 0,
      estimatedCents,
      pastDueCents: 0,
      open: { sinceMs, centsPerHour },
    });
    // Ordered by task and day: the running one (task-1), then the paused one (task-2)
    expect(forecast.steps).toEqual([open(3000, 6000), open(4000, 0)]);
    // The stopped timer's day was released before the data was written: carried
    expect(forecast.carried).toEqual({ actualCents: 0, estimatedCents: 6000, pastDueCents: 0 });
    expect(forecast.recentDays).toEqual([
      { day: formatDateString(new Date(doneStart)), actualCents: 0, estimatedCents: 6000 },
      { day: formatDateString(new Date(pausedStart)), actualCents: 0, estimatedCents: 4000 },
      { day: formatDateString(new Date(start)), actualCents: 0, estimatedCents: 3000 },
    ]);
  });

  it('lists the withdrawals of the 92 days up to the latest, newest first, 12 at most', () => {
    const every3Days = Array.from({ length: 14 }, (_, i) =>
      createMockWithdrawal({ id: `w${i}`, takenAt: iso(W - i * 3 * DAY_MS), amountCents: 100 + i })
    );
    const old = createMockWithdrawal({ id: 'old', takenAt: iso(W - 93 * DAY_MS), amountCents: 1 });
    const { recentWithdrawals, cutoff } = buildPayoutForecast(inputs({ withdrawals: [old, ...every3Days] }), ZONE);
    expect(cutoff).toEqual({ takenAtMs: W, amountCents: 100 });
    expect(recentWithdrawals).toHaveLength(12);
    expect(recentWithdrawals[0]).toEqual({ takenAtMs: W, amountCents: 100 });
    expect(recentWithdrawals[11]).toEqual({ takenAtMs: W - 33 * DAY_MS, amountCents: 111 });

    const twoOnly = buildPayoutForecast(inputs({ withdrawals: [old, every3Days[0]] }), ZONE).recentWithdrawals;
    expect(twoOnly).toEqual([{ takenAtMs: W, amountCents: 100 }]);
  });

  it('says when the scheduled withdrawal is due', () => {
    const releaseMs = releaseOf(created.released);
    const forecast = buildPayoutForecast(
      inputs({
        entries: ledger,
        withdrawals: [withdrawal],
        scheduled: { id: 'sched', releaseAt: iso(releaseMs), createdAt: iso(W + HOUR) },
      }),
      ZONE
    );
    // Released before withdrawals open again, so it waits for the opening
    expect(forecast.scheduled).toEqual({ releaseMs, dueMs: W + 3 * DAY_MS });
  });

  it('lists the earnings of the 42 days up to the latest work day', () => {
    const latest = new Date(2026, 10, 9, 12, 0).getTime();
    const days = [0, 41, 42].map(back => dayjs(latest).subtract(back, 'day').valueOf());
    const entries = days.map((createdMs, i) => entry(`e${i}`, createdMs, 100 * (i + 1), 'Paid', latest));
    const { recentDays } = buildPayoutForecast(inputs({ entries }), ZONE);
    expect(recentDays).toEqual([
      { day: formatDateString(new Date(days[1])), actualCents: 200, estimatedCents: 0 },
      { day: formatDateString(new Date(days[0])), actualCents: 100, estimatedCents: 0 },
    ]);
  });

  it('reads a time it can’t parse as never', () => {
    const odd = createMockTimerInstance({ id: 'odd', isRunning: true, updatedAt: 'not a time' });
    const forecast = buildPayoutForecast(
      inputs({
        sessions: [createMockTaskSession({ timerInstances: [odd] })],
        withdrawals: [createMockWithdrawal({ takenAt: 'not a time' })],
      }),
      ZONE
    );
    expect(forecast.asOfMs).toBe(0);
    expect(forecast.cutoff).toEqual({ takenAtMs: 0, amountCents: 71250 });
  });
});

describe('payoutForecastJson', () => {
  it('writes the contract’s keys in order, with `open` only on open steps', () => {
    const forecast: PayoutForecast = {
      zone: ZONE,
      recentDays: [{ estimatedCents: 2, actualCents: 1, day: '2026-11-07' }],
      steps: [
        { pastDueCents: 0, estimatedCents: 0, actualCents: 5, atMs: 10 },
        { open: { centsPerHour: 6000, sinceMs: 3 }, pastDueCents: 0, estimatedCents: 7, actualCents: 0, atMs: 11 },
      ],
      carried: { pastDueCents: 1, estimatedCents: 0, actualCents: 2 },
      scheduled: { dueMs: 9, releaseMs: 8 },
      nextAllowedAtMs: 7,
      recentWithdrawals: [{ amountCents: 6, takenAtMs: 5 }],
      cutoff: { amountCents: 6, takenAtMs: 5 },
      lastImportMs: 4,
      withdrawalIntervalMs: 3,
      fundsReleaseDays: 2,
      asOfMs: 1,
      schema: 1,
    };
    expect(payoutForecastJson(forecast)).toBe(
      '{"schema":1,"asOfMs":1,"fundsReleaseDays":2,"withdrawalIntervalMs":3,"lastImportMs":4,' +
        '"cutoff":{"takenAtMs":5,"amountCents":6},"recentWithdrawals":[{"takenAtMs":5,"amountCents":6}],' +
        '"nextAllowedAtMs":7,"scheduled":{"releaseMs":8,"dueMs":9},' +
        '"carried":{"actualCents":2,"estimatedCents":0,"pastDueCents":1},' +
        '"steps":[{"atMs":10,"actualCents":5,"estimatedCents":0,"pastDueCents":0},' +
        '{"atMs":11,"actualCents":0,"estimatedCents":7,"pastDueCents":0,"open":{"sinceMs":3,"centsPerHour":6000}}],' +
        '"recentDays":[{"day":"2026-11-07","actualCents":1,"estimatedCents":2}],"zone":"America/Chicago"}'
    );
    expect(payoutForecastJson({ ...forecast, cutoff: null, scheduled: null })).toContain(
      '"cutoff":null,"recentWithdrawals"'
    );
  });
});

describe('publishedForecast', () => {
  it('is the forecast’s JSON with its hash, contract version and TaskMint’s', () => {
    const doc = publishedForecast(inputs(), ZONE)!;
    expect(doc).toEqual({
      json: payoutForecastJson(buildPayoutForecast(inputs(), ZONE)),
      hash: fnv1a64(doc.json),
      schema: 1,
      appVersion: APP_VERSION,
    });
  });

  it('isn’t published when it’s larger than the rules allow', () => {
    // Thousands of separate releases all after the data's latest write (not something the site makes)
    const start = new Date(2026, 10, 9, 0, 1).getTime();
    const entries = Array.from({ length: 3000 }, (_, i) =>
      entry(`e${i}`, start + i * 60_000, 100, 'Pending Approval', start - HOUR)
    ).map(e => ({ ...e, workDay: formatDateString(new Date(start)) }));
    expect(payoutForecastJson(buildPayoutForecast(inputs({ entries }), ZONE)).length).toBeGreaterThan(
      MAX_FORECAST_JSON
    );
    expect(publishedForecast(inputs({ entries }), ZONE)).toBeNull();
  });
});

describe('deviceZone', () => {
  it('is the IANA zone this device is in', () => {
    expect(deviceZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
