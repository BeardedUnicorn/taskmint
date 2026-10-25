/**
 * Moving a project's imported time to another task.
 */

import { Task } from '../../types/task';
import { TaskSession } from '../../types/timer';
import { ProjectTaskMapping, RewriteGroup, WORKLOG_IMPORT_SOURCE, WorkLogEntry } from '../../types/workLog';
import { getInstanceElapsedMs } from '../timerHelpers';
import { mergeLedger } from './ledger';
import { buildRewriteGroups, buildSynthesizedSession } from './rewrite';
import { defaultIdFactory, isRunningOrPaused } from './shared';

export interface RemapPlan {
  /** The project's ledger entries, pointed at the new task. */
  entries: WorkLogEntry[];
  /** The project's mapping, pointed at the new task. */
  mappings: ProjectTaskMapping[];
  groups: RewriteGroup[];
  /** Work days whose imported time moves, oldest first. */
  days: string[];
  /** Time tracked on the new task on those days, which its imported time replaces. */
  replacedTrackedMs: number;
}

/**
 * Move a project to another task, past imported days included: its ledger
 * entries are re-pointed, the new task's days are rebuilt like an import
 * (replacing time tracked on them), and the old task's days are rebuilt from
 * what's left for them there, or emptied of imported time when nothing is.
 * The old task's own tracked time is never touched. Refused while a timer
 * runs on any of those days.
 */
export function buildRemapPlan({
  projectId,
  newTask,
  ledger,
  sessions,
  mappings,
  nowIso,
  idFactory = defaultIdFactory,
}: {
  projectId: string;
  newTask: Pick<Task, 'id' | 'name'>;
  ledger: WorkLogEntry[];
  sessions: TaskSession[];
  mappings: ProjectTaskMapping[];
  nowIso: string;
  idFactory?: () => string;
}): RemapPlan | { error: string } {
  const mapping = mappings.find(m => m.projectId === projectId);
  if (!mapping) return { error: 'That project has no mapping yet' };
  if (mapping.taskId === newTask.id) return { error: `Already mapped to "${newTask.name}"` };
  const oldTaskId = mapping.taskId;

  const moved = ledger
    .filter(entry => entry.projectId === projectId)
    .map(entry => ({ ...entry, taskId: newTask.id, taskName: newTask.name }));
  const { merged } = mergeLedger(ledger, moved);

  // The new task's days: exactly what an import of these entries would do
  const forNewTask = buildRewriteGroups(moved, merged, sessions, { nowIso, idFactory });
  if (forNewTask.blockedDays.length > 0) {
    return { error: `Stop the running timer first (${forNewTask.blockedDays[0].workDay})` };
  }

  // The old task's days: only their imported time is rebuilt
  const oldDays = [...new Set(moved.filter(e => e.kind === 'timed').map(e => e.workDay))];
  const forOldTask: RewriteGroup[] = [];
  for (const workDay of oldDays) {
    const imported = sessions.filter(
      s => s.taskId === oldTaskId && s.source === WORKLOG_IMPORT_SOURCE && s.date === workDay
    );
    const instances = imported.flatMap(s => s.timerInstances);
    if (instances.some(isRunningOrPaused)) {
      return { error: `Stop the running timer first (${workDay})` };
    }
    const remaining = merged.filter(
      e => e.kind === 'timed' && e.taskId === oldTaskId && e.workDay === workDay
    );
    if (instances.length === 0 && remaining.length === 0) continue;
    forOldTask.push({
      taskId: oldTaskId,
      workDay,
      deleteInstanceIds: instances.map(i => i.id),
      blockingInstanceIds: [],
      replacementSession:
        remaining.length > 0
          ? buildSynthesizedSession(oldTaskId, remaining[0].taskName, workDay, remaining, nowIso, idFactory)
          : null,
    });
  }

  const groups = [...forOldTask, ...forNewTask.groups];
  const deleted = new Set(forNewTask.groups.flatMap(g => g.deleteInstanceIds));
  let replacedTrackedMs = 0;
  for (const session of sessions) {
    if (session.taskId !== newTask.id || session.source === WORKLOG_IMPORT_SOURCE) continue;
    for (const instance of session.timerInstances) {
      if (deleted.has(instance.id)) replacedTrackedMs += getInstanceElapsedMs(instance);
    }
  }

  return {
    entries: moved,
    mappings: [{ ...mapping, taskId: newTask.id, taskName: newTask.name, updatedAt: nowIso }],
    groups,
    days: [...new Set(groups.map(g => g.workDay))].sort(),
    replacedTrackedMs,
  };
}
