/**
 * Rewrite groups: for each (task, day) a paste covers, the imported session
 * that replaces what was tracked that day.
 */

import dayjs from 'dayjs';
import type * as Wire from '@taskmint/contracts';
import { TaskSession, TimerInstance } from '../../types/timer';
import { RewriteGroup, WORKLOG_IMPORT_SOURCE, WorkLogEntry } from '../../types/workLog';
import { formatDateString } from '../dateHelpers';
import { getInstanceDateString, instanceTaskId } from '../timerHelpers';
import { effectiveMinutes } from './days';
import { MS_PER_MINUTE, defaultIdFactory, groupKey, isRunningOrPaused } from './shared';

function reconstructedStartMs(entry: WorkLogEntry): number {
  return Date.parse(entry.createdAt) - Math.round(effectiveMinutes(entry) * MS_PER_MINUTE);
}

/** Canonical multiset signature used by the no-op check. */
function instanceSignature(externalId: string, startMs: number, durationMs: number): string {
  return `${externalId}|${startMs}|${durationMs}`;
}

/**
 * One finalized synthesized session for a (task, workDay) bucket, as the
 * backend stores it: one instance per timed ledger entry, ending at the
 * entry's createdAt. Holds the
 * stored invariant duration = endTime − startTime − pausedDuration exactly,
 * and every startTime's local day is workDay by construction (the same
 * instant derived the workDay).
 */
export function buildSynthesizedSession(
  taskId: string,
  taskName: string,
  workDay: string,
  timedEntries: WorkLogEntry[],
  nowIso: string,
  idFactory: () => string = defaultIdFactory
): Wire.TaskSession {
  const sessionId = `session_${idFactory()}`;
  const instances: Wire.TimerInstance[] = [...timedEntries]
    .sort((a, b) => reconstructedStartMs(a) - reconstructedStartMs(b))
    .map(entry => {
      const durationMs = Math.round(effectiveMinutes(entry) * MS_PER_MINUTE);
      const endMs = Date.parse(entry.createdAt);
      return {
        id: `instance_${idFactory()}`,
        sessionId,
        startTime: new Date(endMs - durationMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        duration: durationMs,
        isRunning: false,
        isPaused: false,
        pausedAt: null,
        pausedDuration: null,
        resumedAt: null,
        externalId: entry.id,
        task: null,
        notes: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    });

  // The rate the site's pay implies for this (task, day), unrounded, so
  // rate × time reproduces the imported cents on every page that shows
  // earnings (and a later change to the task's rate leaves it alone).
  // Each instance's duration was set just above
  const totalDuration = instances.reduce((sum, i) => sum + Number(i.duration), 0);
  const totalCents = timedEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const hourlyRate =
    totalDuration > 0 && totalCents > 0 ? totalCents / 100 / (totalDuration / 3_600_000) : null;

  return {
    id: sessionId,
    taskId,
    taskName,
    timerInstances: instances,
    totalDuration,
    notes: null,
    isActive: false,
    source: WORKLOG_IMPORT_SOURCE,
    hourlyRate,
    date: workDay,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Determines whether a timer instance belongs to a given workDay for import reconciliation.
 * - For synthesized import sessions, strict match against session.date (which is workDay).
 * - For tracked sessions:
 *   1. Direct match: instance started on workDay (via getInstanceDateString).
 *   2. Overnight crossing: session was created on workDay, and instance started within the
 *      next calendar day (workDay + 1) before noon, e.g. overnight work shift into early morning.
 *   3. Spanning: instance startTime to endTime spans across workDay.
 */
export function instanceBelongsToWorkDay(
  instance: TimerInstance,
  session: TaskSession,
  workDay: string
): boolean {
  if (session.source === WORKLOG_IMPORT_SOURCE) {
    return session.date === workDay;
  }

  const instWorkDay = getInstanceDateString(instance, session.date);
  if (instWorkDay === workDay) {
    return true;
  }

  // Overnight shift: session created on workDay with an instance starting the following morning (before noon)
  const nextDay = formatDateString(dayjs(workDay).add(1, 'day').toDate());
  if (session.date === workDay && instWorkDay === nextDay) {
    // It has a start: without one, its day would be the session's
    const startHour = new Date(instance.startTime).getHours();
    if (startHour < 12) {
      return true;
    }
  }

  return false;
}

export interface RewriteGroupBuildResult {
  groups: RewriteGroup[];
  /** Buckets that contain a running/paused timer; sent anyway, backend skips them. */
  blockedDays: Array<{ taskId: string; taskName: string; workDay: string }>;
  /** Buckets omitted because they already match the ledger exactly. */
  noopDays: number;
}

/**
 * Build the rewrite groups for one apply. Groups are keyed by the
 * (task, workDay) pairs present in THIS paste — the days the user asked to
 * overwrite — while each group's content comes from the full merged ledger
 * for that key, so partial re-pastes keep a day's other imported entries.
 */
export function buildRewriteGroups(
  pasteEntries: WorkLogEntry[],
  mergedLedger: WorkLogEntry[],
  sessions: TaskSession[],
  opts: { nowIso: string; idFactory?: () => string }
): RewriteGroupBuildResult {
  const idFactory = opts.idFactory ?? defaultIdFactory;
  const groups: RewriteGroup[] = [];
  const blockedDays: RewriteGroupBuildResult['blockedDays'] = [];
  let noopDays = 0;

  const keys = new Map<string, { taskId: string; workDay: string }>();
  for (const entry of pasteEntries) {
    if (entry.kind !== 'timed' || !entry.taskId) continue;
    keys.set(groupKey(entry.taskId, entry.workDay), {
      taskId: entry.taskId,
      workDay: entry.workDay,
    });
  }

  for (const { taskId, workDay } of keys.values()) {
    const ledgerForKey = mergedLedger.filter(
      e => e.kind === 'timed' && e.taskId === taskId && e.workDay === workDay
    );
    if (ledgerForKey.length === 0) continue;

    const deleteInstanceIds: string[] = [];
    const blockingInstanceIds: string[] = [];
    const bucketSessions = new Set<TaskSession>();
    for (const session of sessions) {
      for (const instance of session.timerInstances) {
        // A session can hold other tasks' timers: those stay
        if (instanceTaskId(instance, session) !== taskId) continue;
        if (!instanceBelongsToWorkDay(instance, session, workDay)) continue;
        bucketSessions.add(session);
        if (isRunningOrPaused(instance)) blockingInstanceIds.push(instance.id);
        else deleteInstanceIds.push(instance.id);
      }
    }

    const taskName = ledgerForKey[0].taskName;
    if (blockingInstanceIds.length > 0) {
      blockedDays.push({ taskId, taskName, workDay });
    } else if (isAlreadyConverged(ledgerForKey, bucketSessions, workDay)) {
      noopDays += 1;
      continue;
    }

    groups.push({
      taskId,
      workDay,
      deleteInstanceIds,
      blockingInstanceIds,
      replacementSession: buildSynthesizedSession(
        taskId,
        taskName,
        workDay,
        ledgerForKey,
        opts.nowIso,
        idFactory
      ),
    });
  }

  return { groups, blockedDays, noopDays };
}

/**
 * True when the bucket is exactly one previously synthesized session whose
 * instances match the ledger entries one-for-one — re-pasting unchanged data
 * must not churn the stored sessions.
 */
function isAlreadyConverged(
  ledgerForKey: WorkLogEntry[],
  bucketSessions: Set<TaskSession>,
  workDay: string
): boolean {
  if (bucketSessions.size !== 1) return false;
  const [session] = bucketSessions;
  // An imported session's timers all belong to its day, so they're the bucket
  if (session.source !== WORKLOG_IMPORT_SOURCE || session.date !== workDay) return false;
  if (session.timerInstances.length !== ledgerForKey.length) return false;

  const fromLedger = ledgerForKey
    .map(entry => {
      const durationMs = Math.round(effectiveMinutes(entry) * MS_PER_MINUTE);
      return instanceSignature(entry.id, Date.parse(entry.createdAt) - durationMs, durationMs);
    })
    .sort();
  const fromSessions = session.timerInstances
    .map(instance =>
      instanceSignature(
        instance.externalId ?? '',
        new Date(instance.startTime).getTime(),
        instance.duration ?? 0
      )
    )
    .sort();
  return fromLedger.every((signature, index) => signature === fromSessions[index]);
}
