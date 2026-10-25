/**
 * The imported-entry ledger: entries from a paste, and the by-id upsert.
 */

import { ProjectTaskMapping, WorkLogEntry } from '../../types/workLog';
import type { ParsedSitePayload } from './parse';
import { deriveTimedWorkDay, deriveWorkLogWorkDay, effectiveMinutes } from './days';

/**
 * Turn a parsed paste into ledger entries using the (fully resolved)
 * project→task mappings. Entries for projects without a mapping are omitted —
 * the dialog gates Apply until every project is resolved, so this only
 * matters defensively.
 */
export function buildLedgerEntries(
  parsed: Pick<ParsedSitePayload, 'timedEntries' | 'workLogs'>,
  mappings: ProjectTaskMapping[],
  nowIso: string
): WorkLogEntry[] {
  const mappingByProject = new Map(mappings.map(m => [m.projectId, m]));
  const entries: WorkLogEntry[] = [];

  for (const timed of parsed.timedEntries) {
    const mapping = mappingByProject.get(timed.project.id);
    if (!mapping) continue;
    entries.push({
      id: timed.id,
      kind: 'timed',
      createdAt: timed.createdAt,
      workDay: deriveTimedWorkDay(timed.createdAt, effectiveMinutes(timed)),
      projectId: timed.project.id,
      projectName: timed.project.name,
      taskId: mapping.taskId,
      taskName: mapping.taskName,
      timeInMinutes: timed.timeInMinutes,
      reportedTimeInMinutes: timed.reportedTimeInMinutes ?? null,
      amountCents: Math.round(timed.amountInCents),
      status: timed.status,
      importedAt: nowIso,
      updatedAt: nowIso,
    });
  }

  for (const workLog of parsed.workLogs) {
    const mapping = mappingByProject.get(workLog.project.id);
    if (!mapping) continue;
    entries.push({
      id: workLog.id,
      kind: 'workLog',
      createdAt: workLog.createdAt,
      workDay: deriveWorkLogWorkDay(workLog.createdAt),
      projectId: workLog.project.id,
      projectName: workLog.project.name,
      taskId: mapping.taskId,
      taskName: mapping.taskName,
      timeInMinutes: null,
      reportedTimeInMinutes: null,
      amountCents: Math.round(workLog.amountInCents),
      status: workLog.status,
      importedAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return entries;
}

/**
 * Frontend mirror of the backend's by-id upsert. Group building must run on
 * the post-upsert ledger so a re-paste of a day that already has other
 * imported entries keeps them all.
 */
export function mergeLedger(
  existing: WorkLogEntry[],
  incoming: WorkLogEntry[]
): { merged: WorkLogEntry[]; added: number; updated: number } {
  const merged = existing.map(e => ({ ...e }));
  let added = 0;
  let updated = 0;
  for (const entry of incoming) {
    const index = merged.findIndex(e => e.id === entry.id);
    if (index >= 0) {
      merged[index] = { ...entry, importedAt: merged[index].importedAt || entry.importedAt };
      updated += 1;
    } else {
      merged.push({ ...entry });
      added += 1;
    }
  }
  return { merged, added, updated };
}
