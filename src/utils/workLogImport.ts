/**
 * Work-Log Import Helpers
 *
 * Pure functions behind the paste-JSON import: parsing the site payload,
 * deriving each entry's local work day, resolving project→task mappings,
 * and building the rewrite groups the backend applies.
 *
 * Day attribution matches the app's session bucketing (timerHelpers): time
 * belongs to the local calendar day the work STARTED. A timed entry's start is
 * reconstructed as createdAt − effectiveMinutes, on the assumption that the
 * site entry was created when the work was reported, right after finishing.
 */

import { Task } from '../types/task';
import { TaskSession, TimerInstance, TimerState } from '../types/timer';
import {
  ProjectTaskMapping,
  RewriteGroup,
  SiteTimedWorkEntry,
  SiteTimedWorkEntrySchema,
  SiteWorkLog,
  SiteWorkLogSchema,
  WORKLOG_IMPORT_SOURCE,
  WorkLogEntry,
} from '../types/workLog';
import { formatDateString } from './dateHelpers';
import { getInstanceDateString, getSessionElapsedMsOnDate } from './timerHelpers';

const MS_PER_MINUTE = 60_000;

function defaultIdFactory(): string {
  return crypto.randomUUID();
}

// ============================================================================
// PAYLOAD PARSING
// ============================================================================

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

// ============================================================================
// DAY DERIVATION
// ============================================================================

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

// ============================================================================
// PROJECT → TASK MAPPING
// ============================================================================

export interface MappingResolution {
  /** Mappings usable for this paste (existing + auto-matched); persist these. */
  resolved: ProjectTaskMapping[];
  /** Projects the dialog must ask the user about. */
  unresolved: Array<{ projectId: string; projectName: string }>;
}

/**
 * Resolve each distinct pasted project to a task: a stored mapping wins
 * (unless its task no longer exists), then an exact trimmed
 * case-insensitive name match against the task list (archived included),
 * otherwise the project is unresolved and the dialog prompts once.
 */
export function resolveProjectMappings(
  projects: Array<{ id: string; name: string }>,
  existingMappings: ProjectTaskMapping[],
  tasks: Task[],
  nowIso: string
): MappingResolution {
  const resolved: ProjectTaskMapping[] = [];
  const unresolved: Array<{ projectId: string; projectName: string }> = [];
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const seen = new Set<string>();

  for (const project of projects) {
    if (seen.has(project.id)) continue;
    seen.add(project.id);

    const existing = existingMappings.find(m => m.projectId === project.id);
    if (existing && taskById.has(existing.taskId)) {
      const task = taskById.get(existing.taskId)!;
      resolved.push({
        ...existing,
        projectName: project.name,
        taskName: task.name,
        updatedAt: nowIso,
      });
      continue;
    }

    const wanted = project.name.trim().toLowerCase();
    const match = tasks.find(t => t.name.trim().toLowerCase() === wanted);
    if (match) {
      resolved.push({
        projectId: project.id,
        projectName: project.name,
        taskId: match.id,
        taskName: match.name,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      continue;
    }

    unresolved.push({ projectId: project.id, projectName: project.name });
  }

  return { resolved, unresolved };
}

// ============================================================================
// LEDGER CONSTRUCTION
// ============================================================================

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

// ============================================================================
// REWRITE GROUPS
// ============================================================================

function isRunningOrPaused(instance: TimerInstance): boolean {
  return (
    instance.state === TimerState.running ||
    instance.state === TimerState.paused ||
    Boolean(instance.isRunning) ||
    Boolean(instance.isPaused)
  );
}

function groupKey(taskId: string, workDay: string): string {
  return `${taskId} ${workDay}`;
}

function reconstructedStartMs(entry: WorkLogEntry): number {
  return Date.parse(entry.createdAt) - Math.round(effectiveMinutes(entry) * MS_PER_MINUTE);
}

/** Canonical multiset signature used by the no-op check. */
function instanceSignature(externalId: string, startMs: number, durationMs: number): string {
  return `${externalId}|${startMs}|${durationMs}`;
}

/**
 * One finalized synthesized session for a (task, workDay) bucket: one
 * instance per timed ledger entry, ending at the entry's createdAt. Holds the
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
): TaskSession {
  const sessionId = `session_${idFactory()}`;
  const instances: TimerInstance[] = [...timedEntries]
    .sort((a, b) => reconstructedStartMs(a) - reconstructedStartMs(b))
    .map(entry => {
      const durationMs = Math.round(effectiveMinutes(entry) * MS_PER_MINUTE);
      const endMs = Date.parse(entry.createdAt);
      return {
        id: `instance_${idFactory()}`,
        sessionId,
        startTime: new Date(endMs - durationMs),
        endTime: new Date(endMs),
        duration: durationMs,
        state: TimerState.stopped,
        isRunning: false,
        isPaused: false,
        externalId: entry.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    });

  return {
    id: sessionId,
    taskId,
    taskName,
    timerInstances: instances,
    totalDuration: instances.reduce((sum, i) => sum + (i.duration ?? 0), 0),
    isActive: false,
    source: WORKLOG_IMPORT_SOURCE,
    date: workDay,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
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
    let bucketSize = 0;
    for (const session of sessions) {
      if (session.taskId !== taskId) continue;
      for (const instance of session.timerInstances) {
        if (getInstanceDateString(instance, session.date) !== workDay) continue;
        bucketSize += 1;
        bucketSessions.add(session);
        if (isRunningOrPaused(instance)) blockingInstanceIds.push(instance.id);
        else deleteInstanceIds.push(instance.id);
      }
    }

    const taskName = ledgerForKey[0].taskName;
    if (blockingInstanceIds.length > 0) {
      blockedDays.push({ taskId, taskName, workDay });
    } else if (isAlreadyConverged(ledgerForKey, bucketSessions, bucketSize, workDay)) {
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
  bucketSize: number,
  workDay: string
): boolean {
  if (bucketSessions.size !== 1) return false;
  const [session] = bucketSessions;
  if (session.source !== WORKLOG_IMPORT_SOURCE || session.date !== workDay) return false;
  if (session.timerInstances.length !== bucketSize) return false;
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

// ============================================================================
// PREVIEW + RATES
// ============================================================================

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
      if (session.taskId !== taskId) continue;
      trackedMs += getSessionElapsedMsOnDate(session, workDay, nowMs);
      for (const instance of session.timerInstances) {
        if (getInstanceDateString(instance, session.date) !== workDay) continue;
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
