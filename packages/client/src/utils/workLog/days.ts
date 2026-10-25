/**
 * Which local day an imported entry's time belongs to: the day the work
 * started (createdAt − effective minutes for timed entries), matching how the
 * app buckets tracked time.
 */

import { formatDateString } from '../dateHelpers';
import { MS_PER_MINUTE } from './shared';

/**
 * The minutes an entry is worth: the site's reported figure when present
 * (a real 0 counts), otherwise the raw timed figure.
 */
export function effectiveMinutes(entry: {
  timeInMinutes?: number | null;
  reportedTimeInMinutes?: number | null;
}): number {
  return entry.reportedTimeInMinutes ?? entry.timeInMinutes ?? 0;
}

/**
 * Local work day of a timed entry: the local calendar day of its
 * reconstructed start (createdAt − effectiveMinutes). Pure instant math
 * followed by local-day formatting, so DST transitions cannot produce
 * nonexistent wall times.
 */
export function deriveTimedWorkDay(createdAtIso: string, effMinutes: number): string {
  const startMs = Date.parse(createdAtIso) - Math.round(effMinutes * MS_PER_MINUTE);
  return formatDateString(new Date(startMs));
}

/** Local work day of a no-time work log: the local day it was created. */
export function deriveWorkLogWorkDay(createdAtIso: string): string {
  return formatDateString(new Date(Date.parse(createdAtIso)));
}
