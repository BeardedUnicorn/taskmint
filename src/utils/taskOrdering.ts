/**
 * Task ordering for the start pickers. Mirrors the tray's Start submenu
 * (visible_tasks in src-tauri/src/tray.rs), so every place you start work
 * lists tasks the same way: favorites first, then the most recently used,
 * then the rest alphabetically. Archived tasks are left out.
 */

import { Task } from '../types/task';
import { TaskSession } from '../types/timer';

/** When each task last had a timer start, keyed by task id. */
export function lastUsedByTask(sessions: TaskSession[]): Map<string, number> {
  const lastUsed = new Map<string, number>();
  for (const session of sessions) {
    for (const instance of session.timerInstances ?? []) {
      const startMs = new Date(instance.startTime).getTime();
      if (Number.isNaN(startMs)) continue;
      const latest = lastUsed.get(session.taskId);
      if (latest === undefined || startMs > latest) {
        lastUsed.set(session.taskId, startMs);
      }
    }
  }
  return lastUsed;
}

export function orderTasksForStart(tasks: Task[], sessions: TaskSession[]): Task[] {
  const lastUsed = lastUsedByTask(sessions);
  return tasks
    .filter(task => !task.isArchived)
    .sort((a, b) => {
      const favorite = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
      if (favorite !== 0) return favorite;
      const aUsed = lastUsed.get(a.id);
      const bUsed = lastUsed.get(b.id);
      if (aUsed !== undefined && bUsed !== undefined) return bUsed - aUsed;
      if (aUsed !== undefined) return -1;
      if (bUsed !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
}
