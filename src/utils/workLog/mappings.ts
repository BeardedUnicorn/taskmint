/**
 * Matching the site's projects to tasks.
 */

import { Task } from '../../types/task';
import { ProjectTaskMapping } from '../../types/workLog';

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
