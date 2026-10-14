/**
 * Reading the site's pasted or captured JSON.
 */

import { SiteTimedWorkEntry, SiteTimedWorkEntrySchema, SiteWorkLog, SiteWorkLogSchema } from '../../types/workLog';

export interface ParsedSitePayload {
  timedEntries: SiteTimedWorkEntry[];
  workLogs: SiteWorkLog[];
  /** Records that failed per-record validation and were skipped. */
  skippedRecords: number;
  /** Fatal problem with the paste as a whole (not JSON, wrong shape). */
  error: string | null;
}

/**
 * Parse the pasted site JSON leniently: unknown extra fields are stripped by
 * the schemas, and a single bad record is skipped (counted) instead of
 * failing the whole paste. Only structural problems are fatal.
 */
export function parseWorkLogPayload(rawText: string): ParsedSitePayload {
  const empty: ParsedSitePayload = {
    timedEntries: [],
    workLogs: [],
    skippedRecords: 0,
    error: null,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ...empty, error: 'Not valid JSON' };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...empty, error: 'Expected a JSON object with timedWorkEntries and/or workLogs' };
  }

  const payload = parsed as Record<string, unknown>;
  const rawTimed = payload.timedWorkEntries ?? [];
  const rawWorkLogs = payload.workLogs ?? [];
  if (!Array.isArray(rawTimed) || !Array.isArray(rawWorkLogs)) {
    return { ...empty, error: 'timedWorkEntries and workLogs must be arrays' };
  }

  let skippedRecords = 0;
  const timedEntries: SiteTimedWorkEntry[] = [];
  for (const record of rawTimed) {
    const result = SiteTimedWorkEntrySchema.safeParse(record);
    if (result.success) timedEntries.push(result.data);
    else skippedRecords += 1;
  }
  const workLogs: SiteWorkLog[] = [];
  for (const record of rawWorkLogs) {
    const result = SiteWorkLogSchema.safeParse(record);
    if (result.success) workLogs.push(result.data);
    else skippedRecords += 1;
  }

  return { timedEntries, workLogs, skippedRecords, error: null };
}
