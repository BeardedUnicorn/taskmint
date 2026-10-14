/**
 * The hourly rate the site's pay implies, per task.
 */

import { WorkLogEntry } from '../../types/workLog';
import { effectiveMinutes } from './days';

export interface ImpliedTaskRate {
  taskId: string;
  taskName: string;
  impliedHourlyRate: number;
  entryCount: number;
}

/**
 * Hourly rate the site's numbers imply, per task, from this paste's timed
 * entries. Used by the optional "update task hourly rates" step so the app's
 * rate-based estimates stay close to real pay.
 */
export function computeImpliedRates(pasteEntries: WorkLogEntry[]): ImpliedTaskRate[] {
  const byTask = new Map<string, { taskName: string; cents: number; minutes: number; count: number }>();
  for (const entry of pasteEntries) {
    if (entry.kind !== 'timed' || !entry.taskId) continue;
    const bucket = byTask.get(entry.taskId) ?? {
      taskName: entry.taskName,
      cents: 0,
      minutes: 0,
      count: 0,
    };
    bucket.cents += entry.amountCents;
    bucket.minutes += effectiveMinutes(entry);
    bucket.count += 1;
    byTask.set(entry.taskId, bucket);
  }

  const rates: ImpliedTaskRate[] = [];
  for (const [taskId, bucket] of byTask) {
    if (bucket.minutes <= 0) continue;
    // dollars/hour = (cents / 100) / (minutes / 60); TaskSchema caps rates at 1000.
    const rate = Math.round(((bucket.cents * 60) / (bucket.minutes * 100)) * 100) / 100;
    rates.push({
      taskId,
      taskName: bucket.taskName,
      impliedHourlyRate: Math.min(rate, 1000),
      entryCount: bucket.count,
    });
  }
  return rates;
}
