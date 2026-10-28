/**
 * The import pipeline the paste dialog and browser capture share: from a
 * parsed payload to what the backend applies (apply_work_log_import), and the
 * task-rate update that follows.
 */

import { Task } from '../../types/task';
import { TaskSession } from '../../types/timer';
import { ProjectTaskMapping, WorkLogEntry, WorkLogImportPayload } from '../../types/workLog';
import type { ParsedSitePayload } from './parse';
import { resolveProjectMappings } from './mappings';
import { buildLedgerEntries, mergeLedger } from './ledger';
import { buildRewriteGroups } from './rewrite';
import { ImpliedTaskRate, computeImpliedRates } from './rates';

export interface ImportContext {
  /** The ledger as stored. */
  entries: WorkLogEntry[];
  /** Project → task mappings as stored. */
  mappings: ProjectTaskMapping[];
  tasks: Task[];
  sessions: TaskSession[];
  nowIso: string;
  /** Tasks chosen (in the dialog) for projects with no mapping yet. */
  chosenMappings?: ProjectTaskMapping[];
}

type Project = { projectId: string; projectName: string };

interface PlanDetails {
  /** Projects with no stored mapping or same-named task: each needs a choice. */
  unmatched: Project[];
  /** Stored, auto-matched and chosen mappings for the paste's projects. */
  mappings: ProjectTaskMapping[];
  /** Ledger entries for the projects mapped so far. */
  entries: WorkLogEntry[];
  /** The stored ledger with those entries upserted. */
  merged: WorkLogEntry[];
}

export type WorkLogImportPlan =
  | { status: 'error'; error: string }
  | { status: 'empty' }
  | ({ status: 'needs-mapping'; /** Still without a task. */ unresolved: Project[] } & PlanDetails)
  | ({ status: 'ready'; payload: WorkLogImportPayload; impliedRates: ImpliedTaskRate[] } & PlanDetails);

/** The distinct projects a payload mentions. */
export function payloadProjects(parsed: Pick<ParsedSitePayload, 'timedEntries' | 'workLogs'>) {
  const byId = new Map<string, { id: string; name: string }>();
  for (const record of [...parsed.timedEntries, ...parsed.workLogs]) {
    byId.set(record.project.id, record.project);
  }
  return [...byId.values()];
}

/**
 * What importing `parsed` takes: nothing (`error`, `empty`), a task for each
 * project not matched yet (`needs-mapping`), or the backend payload and the
 * rates the pay implies (`ready`).
 */
export function planWorkLogImport(parsed: ParsedSitePayload, context: ImportContext): WorkLogImportPlan {
  if (parsed.error) return { status: 'error', error: parsed.error };
  if (parsed.timedEntries.length === 0 && parsed.workLogs.length === 0) return { status: 'empty' };

  const resolution = resolveProjectMappings(payloadProjects(parsed), context.mappings, context.tasks, context.nowIso);
  const unresolvedIds = new Set(resolution.unresolved.map(project => project.projectId));
  const mappings = [
    ...resolution.resolved,
    ...(context.chosenMappings ?? []).filter(mapping => unresolvedIds.has(mapping.projectId)),
  ];
  const mapped = new Set(mappings.map(mapping => mapping.projectId));
  const unresolved = resolution.unresolved.filter(project => !mapped.has(project.projectId));

  const entries = buildLedgerEntries(parsed, mappings, context.nowIso);
  const { merged } = mergeLedger(context.entries, entries);
  const details = { unmatched: resolution.unresolved, mappings, entries, merged };

  // Every project is mapped now, so every record has an entry
  if (unresolved.length > 0) return { status: 'needs-mapping', unresolved, ...details };

  const { groups } = buildRewriteGroups(entries, merged, context.sessions, { nowIso: context.nowIso });
  return {
    status: 'ready',
    payload: { entries, mappings, rewriteGroups: groups },
    impliedRates: computeImpliedRates(entries),
    ...details,
  };
}

/**
 * Sets each task's hourly rate to what the site's pay implies, where it
 * differs. A failed update is skipped (updateTask reports it): the import
 * itself already went through. Resolves to how many rates changed.
 */
export async function applyImpliedRates(
  tasks: Task[],
  impliedRates: ImpliedTaskRate[],
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<unknown>
): Promise<number> {
  let changed = 0;
  for (const implied of impliedRates) {
    const task = tasks.find(t => t.id === implied.taskId);
    if (!task || task.hourlyRate === implied.impliedHourlyRate) continue;
    try {
      await updateTask(implied.taskId, { hourlyRate: implied.impliedHourlyRate });
      changed += 1;
    } catch {
      // Reported by updateTask
    }
  }
  return changed;
}
