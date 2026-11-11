/**
 * The payout forecast TaskMint publishes for other apps (BudgetMint):
 * `users/{uid}/published/payoutForecast` in the cloud, with what the coming
 * withdrawals can take, so they can plan with it without TaskMint's math.
 * The contract is docs/contracts/payout-forecast.md.
 *
 * It carries the withdrawable curve after the latest withdrawal (see
 * withdrawableCurve): a withdrawal at `t` takes `carried` plus every step at
 * or before `t`, and the next one, an interval later at least, takes what the
 * curve adds after that. Nothing in it depends on the clock, so every device
 * with the same data builds the same bytes, and a new one is written only
 * when the data changes:
 *
 * - Timers still open (no end yet) are measured as of `openAsOfMs`, the
 *   latest moment one of them changed, instead of now. Their step says so
 *   (`open`): a reader adds what a running one has earned since, at its rate,
 *   and releases it the release days after it stops.
 * - Steps released by `asOfMs` (the latest moment the data was written, so
 *   never after now) are in `carried`: any withdrawal from now on takes them.
 *
 * Only money and times go out: no task names, notes or anything typed.
 */

import dayjs from 'dayjs';
import type { PublishedDoc } from '../cloud/types';
import { Task } from '../types/task';
import { TaskSession, TimerState } from '../types/timer';
import { ScheduledWithdrawal, Withdrawal } from '../types/withdrawal';
import { WorkLogEntry } from '../types/workLog';
import { APP_VERSION } from './appVersion';
import { formatDateString, parseDateStringLocal } from './dateHelpers';
import { instanceRate } from './earnings';
import { fnv1a64 } from './fnv';
import { buildPayoutCells, buildReleaseEvents, lastImportMs } from './payoutCalculator';
import { getInstanceDateString, instanceTaskId } from './timerHelpers';
import { CurveAmount, DAY_MS, addRelease, classifyRelease, planReminder, planWithdrawals } from './withdrawals';

/** The contract's version: a reader skips a forecast with a newer one. */
export const PAYOUT_FORECAST_SCHEMA = 1;
/** The published document's name, under users/{uid}/published. */
export const PAYOUT_FORECAST_DOC = 'payoutForecast';
/** The rules refuse a larger forecast (firebase/firestore.rules). */
export const MAX_FORECAST_JSON = 200_000;

/** How many recent withdrawals it lists, and how far back from the latest. */
const RECENT_WITHDRAWALS = 12;
const RECENT_WITHDRAWALS_MS = 92 * DAY_MS;
/** How many days of earnings it lists, up to the latest work day. */
const RECENT_DAYS = 42;

export interface ForecastStep extends CurveAmount {
  /** When it becomes withdrawable. */
  atMs: number;
  /**
   * A timer on its day hasn't stopped: its money is as of `sinceMs`, and it's
   * released the release days after the timer stops. A running one earns
   * `centsPerHour` meanwhile (0 when paused).
   */
  open?: { sinceMs: number; centsPerHour: number };
}

export interface PayoutForecast {
  schema: typeof PAYOUT_FORECAST_SCHEMA;
  /** The latest moment the data was written: no reader's now is earlier. */
  asOfMs: number;
  /** Days after work its earnings are released. */
  fundsReleaseDays: number;
  /** The wait between withdrawals. */
  withdrawalIntervalMs: number;
  /** When the ledger was last imported; null for never. */
  lastImportMs: number | null;
  /** The latest withdrawal, which the curve counts from; null with none recorded. */
  cutoff: { takenAtMs: number; amountCents: number } | null;
  /** Withdrawals in the 92 days up to the latest, newest first (12 at most). */
  recentWithdrawals: { takenAtMs: number; amountCents: number }[];
  /** When the next withdrawal is allowed; null with none recorded. */
  nextAllowedAtMs: number | null;
  /** The withdrawal the user scheduled: for the release at releaseMs, due at dueMs. */
  scheduled: { releaseMs: number; dueMs: number } | null;
  /** In every withdrawal from asOfMs on (until one takes it). */
  carried: CurveAmount;
  /** Released after asOfMs, soonest first. */
  steps: ForecastStep[];
  /** Earnings per work day for the 42 days up to the latest, oldest first (days with none left out). */
  recentDays: { day: string; actualCents: number; estimatedCents: number }[];
  /** The IANA time zone the days are in. */
  zone: string;
}

/** What the forecast is built from: the same as the Payouts page's. */
export interface PayoutInputs {
  entries: WorkLogEntry[];
  sessions: TaskSession[];
  tasks: Task[];
  withdrawals: Withdrawal[];
  scheduled: ScheduledWithdrawal | null;
  fundsReleaseDays: number;
  withdrawalIntervalDays: number;
}

/** This device's time zone. */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A time as milliseconds; 0 (never) for one that doesn't parse. */
const parsed = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
};

const cellKey = (taskId: string, workDay: string) => `${taskId} ${workDay}`;

/** The timers that haven't stopped, by (task, day), with what they earn an hour; and when they last changed. */
function openTimers(sessions: TaskSession[], tasks: Task[]) {
  const open = new Map<string, number>();
  let sinceMs = 0;
  for (const session of sessions) {
    for (const instance of session.timerInstances) {
      if (instance.endTime) continue;
      const key = cellKey(instanceTaskId(instance, session), getInstanceDateString(instance, session.date));
      const rate = instance.state === TimerState.running ? Math.round(instanceRate(instance, session, tasks) * 100) : 0;
      open.set(key, (open.get(key) ?? 0) + rate);
      sinceMs = Math.max(sinceMs, parsed(instance.updatedAt));
    }
  }
  return { open, sinceMs };
}

/** The latest moment the data was written (imports and timers): no later than any reader's now. */
function dataAsOfMs(entries: WorkLogEntry[], sessions: TaskSession[]): number {
  let latest = lastImportMs(entries) ?? 0;
  for (const session of sessions) {
    for (const instance of session.timerInstances) latest = Math.max(latest, parsed(instance.updatedAt));
  }
  return latest;
}

const noMoney = (): CurveAmount => ({ actualCents: 0, estimatedCents: 0, pastDueCents: 0 });

/** The forecast for `inputs`, its days in `zone` (this device's). */
export function buildPayoutForecast(inputs: PayoutInputs, zone: string): PayoutForecast {
  const { entries, sessions, tasks, withdrawals, scheduled, fundsReleaseDays, withdrawalIntervalDays } = inputs;
  const intervalMs = withdrawalIntervalDays * DAY_MS;
  const { open, sinceMs } = openTimers(sessions, tasks);
  const asOfMs = dataAsOfMs(entries, sessions);

  // As of when the open timers last changed, not now
  const cells = buildPayoutCells(entries, sessions, tasks, fundsReleaseDays, sinceMs);
  const events = buildReleaseEvents(cells, entries, fundsReleaseDays);

  const ordered = [...withdrawals].sort((a, b) => parsed(b.takenAt) - parsed(a.takenAt));
  const last = ordered[0] ?? null;
  const cutoffMs = last ? parsed(last.takenAt) : null;

  const carried = noMoney();
  const closed = new Map<number, ForecastStep>();
  const opened = new Map<string, ForecastStep>();
  for (const event of events) {
    const count = classifyRelease(event, cutoffMs);
    if (count === 'never') continue;
    const key = cellKey(event.taskId, event.workDay);
    const centsPerHour = event.status === undefined ? open.get(key) : undefined;
    if (centsPerHour !== undefined) {
      // A day's estimate is one event, so its open step is its own
      const step: ForecastStep = { atMs: event.releaseMs, ...noMoney(), open: { sinceMs, centsPerHour } };
      addRelease(step, event);
      opened.set(key, step);
      continue;
    }
    if (count === 'carried' || event.releaseMs <= asOfMs) {
      addRelease(carried, event);
      continue;
    }
    const step = closed.get(event.releaseMs) ?? { atMs: event.releaseMs, ...noMoney() };
    closed.set(event.releaseMs, step);
    addRelease(step, event);
  }
  const openSteps = [...opened.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, step]) => step);
  // Closed before open at the same time; the sort is stable
  const steps = [...closed.values(), ...openSteps].sort((a, b) => a.atMs - b.atMs);

  const plan = planWithdrawals(events, withdrawals, intervalMs, sinceMs);
  const reminder = planReminder(scheduled, plan, events);

  const byDay = new Map<string, { day: string; actualCents: number; estimatedCents: number }>();
  for (const cell of cells) {
    const day = byDay.get(cell.workDay) ?? { day: cell.workDay, actualCents: 0, estimatedCents: 0 };
    byDay.set(cell.workDay, day);
    day.actualCents += cell.actualCents;
    day.estimatedCents += cell.estimatedCents;
  }
  const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const latestDay = days.at(-1)?.day;
  const firstDay = latestDay
    ? formatDateString(
        dayjs(parseDateStringLocal(latestDay))
          .subtract(RECENT_DAYS - 1, 'day')
          .toDate()
      )
    : '';

  return {
    schema: PAYOUT_FORECAST_SCHEMA,
    asOfMs,
    fundsReleaseDays,
    withdrawalIntervalMs: intervalMs,
    lastImportMs: lastImportMs(entries),
    cutoff: last && cutoffMs !== null ? { takenAtMs: cutoffMs, amountCents: last.amountCents } : null,
    recentWithdrawals: ordered
      .filter(withdrawal => cutoffMs !== null && parsed(withdrawal.takenAt) >= cutoffMs - RECENT_WITHDRAWALS_MS)
      .slice(0, RECENT_WITHDRAWALS)
      .map(withdrawal => ({ takenAtMs: parsed(withdrawal.takenAt), amountCents: withdrawal.amountCents })),
    nextAllowedAtMs: cutoffMs === null ? null : cutoffMs + intervalMs,
    scheduled: reminder ? { releaseMs: reminder.releaseMs, dueMs: reminder.dueMs } : null,
    carried,
    steps,
    recentDays: days.filter(day => day.day >= firstDay),
    zone,
  };
}

const amountJson = ({ actualCents, estimatedCents, pastDueCents }: CurveAmount) => ({
  actualCents,
  estimatedCents,
  pastDueCents,
});

/**
 * The forecast as the JSON that's published: its keys always in the
 * contract's order, so the same forecast is always the same bytes (and hash).
 */
export function payoutForecastJson(forecast: PayoutForecast): string {
  return JSON.stringify({
    schema: forecast.schema,
    asOfMs: forecast.asOfMs,
    fundsReleaseDays: forecast.fundsReleaseDays,
    withdrawalIntervalMs: forecast.withdrawalIntervalMs,
    lastImportMs: forecast.lastImportMs,
    cutoff: forecast.cutoff && { takenAtMs: forecast.cutoff.takenAtMs, amountCents: forecast.cutoff.amountCents },
    recentWithdrawals: forecast.recentWithdrawals.map(({ takenAtMs, amountCents }) => ({ takenAtMs, amountCents })),
    nextAllowedAtMs: forecast.nextAllowedAtMs,
    scheduled: forecast.scheduled && { releaseMs: forecast.scheduled.releaseMs, dueMs: forecast.scheduled.dueMs },
    carried: amountJson(forecast.carried),
    steps: forecast.steps.map(step => ({
      atMs: step.atMs,
      ...amountJson(step),
      ...(step.open ? { open: { sinceMs: step.open.sinceMs, centsPerHour: step.open.centsPerHour } } : {}),
    })),
    recentDays: forecast.recentDays.map(({ day, actualCents, estimatedCents }) => ({
      day,
      actualCents,
      estimatedCents,
    })),
    zone: forecast.zone,
  });
}

/**
 * The forecast for `inputs` as the document cloud sync publishes; null when
 * it's too large for the rules (it never should be: the steps are only what's
 * released after the data was last written).
 */
export function publishedForecast(inputs: PayoutInputs, zone: string): PublishedDoc | null {
  const json = payoutForecastJson(buildPayoutForecast(inputs, zone));
  if (json.length > MAX_FORECAST_JSON) return null;
  return { json, hash: fnv1a64(json), schema: PAYOUT_FORECAST_SCHEMA, appVersion: APP_VERSION };
}
