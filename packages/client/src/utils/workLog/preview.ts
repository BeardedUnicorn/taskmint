/**
 * What an import will do to each day, for the dialog's preview.
 */

import { TaskSession } from '../../types/timer';
import { WORKLOG_IMPORT_SOURCE, WorkLogEntry } from '../../types/workLog';
import { getInstanceElapsedMs, instanceTaskId } from '../timerHelpers';
import { effectiveMinutes } from './days';
import { instanceBelongsToWorkDay } from './rewrite';
import { MS_PER_MINUTE, groupKey, isRunningOrPaused } from './shared';

export interface ImportPreviewRow {
  workDay: string;
  taskId: string;
  taskName: string;
  projectName: string;
  /** Current tracked ms in the (task, day) bucket, live timers included. */
  trackedMs: number;
  /** Minutes the day will show after apply (merged ledger, timed entries). */
  importedMinutes: number;
  deltaMinutes: number;
  /** Cents the day will carry after apply (timed + workLog entries). */
  amountCents: number;
  /** A running/paused timer sits in the bucket; the backend will skip it. */
  blocked: boolean;
  /** The day was imported before; applying overwrites the previous import. */
  isRemap: boolean;
}

/** Per-day diff of what THIS paste will do, for the dialog's preview table. */
export function buildImportPreview(
  pasteEntries: WorkLogEntry[],
  mergedLedger: WorkLogEntry[],
  sessions: TaskSession[],
  nowMs: number
): ImportPreviewRow[] {
  const keys = new Map<string, { taskId: string; workDay: string; projectName: string }>();
  for (const entry of pasteEntries) {
    if (!entry.taskId) continue;
    const key = groupKey(entry.taskId, entry.workDay);
    if (!keys.has(key)) {
      keys.set(key, {
        taskId: entry.taskId,
        workDay: entry.workDay,
        projectName: entry.projectName,
      });
    }
  }

  const rows: ImportPreviewRow[] = [];
  for (const { taskId, workDay, projectName } of keys.values()) {
    const ledgerForKey = mergedLedger.filter(e => e.taskId === taskId && e.workDay === workDay);
    const timed = ledgerForKey.filter(e => e.kind === 'timed');
    const importedMinutes = timed.reduce((sum, e) => sum + effectiveMinutes(e), 0);
    const amountCents = ledgerForKey.reduce((sum, e) => sum + e.amountCents, 0);
    const taskName = ledgerForKey[0]?.taskName ?? '';

    let trackedMs = 0;
    let blocked = false;
    let isRemap = false;
    for (const session of sessions) {
      for (const instance of session.timerInstances) {
        if (instanceTaskId(instance, session) !== taskId) continue;
        if (!instanceBelongsToWorkDay(instance, session, workDay)) continue;
        trackedMs += getInstanceElapsedMs(instance, nowMs);
        if (timed.length > 0 && isRunningOrPaused(instance)) blocked = true;
        if (session.source === WORKLOG_IMPORT_SOURCE) isRemap = true;
      }
    }

    rows.push({
      workDay,
      taskId,
      taskName,
      projectName,
      trackedMs,
      importedMinutes,
      deltaMinutes: importedMinutes - trackedMs / MS_PER_MINUTE,
      amountCents,
      blocked,
      isRemap,
    });
  }

  return rows.sort(
    (a, b) => b.workDay.localeCompare(a.workDay) || a.taskName.localeCompare(b.taskName)
  );
}
