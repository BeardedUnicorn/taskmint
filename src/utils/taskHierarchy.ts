/**
 * Task Hierarchy Utilities
 * 
 * Utility functions for managing hierarchical task structures
 */

import { Task, TaskHierarchy, TaskTreeNode, TaskDeletionStrategy } from '../types/task';

/**
 * Build a hierarchical tree structure from flat task array
 */
export function buildTaskHierarchy(tasks: Task[]): TaskHierarchy[] {
  const taskMap = new Map<string, Task>();
  const rootTasks: TaskHierarchy[] = [];
  
  // Create a map for quick lookup
  tasks.forEach(task => {
    taskMap.set(task.id, task);
  });

  // Build hierarchy recursively
  function buildNode(task: Task, depth: number = 0, path: string[] = []): TaskHierarchy {
    const children = tasks
      .filter(t => t.parentId === task.id)
      .sort((a, b) => (a.childOrder || 0) - (b.childOrder || 0))
      .map(child => buildNode(child, depth + 1, [...path, task.name]));

    return {
      task,
      children,
      depth,
      path,
    };
  }

  // Find root tasks (no parent) and build their hierarchies
  tasks
    .filter(task => !task.parentId)
    .sort((a, b) => (a.childOrder || 0) - (b.childOrder || 0))
    .forEach(rootTask => {
      rootTasks.push(buildNode(rootTask));
    });

  return rootTasks;
}

/**
 * Flatten hierarchical structure to a linear array with depth information
 */
export function flattenTaskHierarchy(hierarchy: TaskHierarchy[]): TaskTreeNode[] {
  const flattened: TaskTreeNode[] = [];

  function flatten(nodes: TaskHierarchy[]) {
    nodes.forEach(node => {
      flattened.push({
        ...node.task,
        children: node.children.map(child => ({
          ...child.task,
          children: [],
          depth: child.depth,
        })),
        depth: node.depth,
      });
      
      if (node.children.length > 0) {
        flatten(node.children);
      }
    });
  }

  flatten(hierarchy);
  return flattened;
}

/**
 * Get all child tasks of a parent task (recursive)
 */
export function getChildTasks(tasks: Task[], parentId: string): Task[] {
  const children: Task[] = [];
  
  function collectChildren(currentParentId: string) {
    const directChildren = tasks.filter(task => task.parentId === currentParentId);
    children.push(...directChildren);
    
    // Recursively collect grandchildren
    directChildren.forEach(child => {
      collectChildren(child.id);
    });
  }
  
  collectChildren(parentId);
  return children;
}

/**
 * Get the parent task of a given task
 */
export function getParentTask(tasks: Task[], taskId: string): Task | undefined {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.parentId) {
    return undefined;
  }
  
  return tasks.find(t => t.id === task.parentId);
}

/**
 * Get the full path from root to a specific task
 */
export function getTaskPath(tasks: Task[], taskId: string): Task[] {
  const path: Task[] = [];
  let currentTask = tasks.find(t => t.id === taskId);
  
  while (currentTask) {
    path.unshift(currentTask);
    currentTask = currentTask.parentId 
      ? tasks.find(t => t.id === currentTask!.parentId) 
      : undefined;
  }
  
  return path;
}

/**
 * Get the display name with hierarchy (e.g., "Project > Sub-task > Task")
 */
export function getTaskDisplayName(tasks: Task[], taskId: string, separator: string = ' > '): string {
  const path = getTaskPath(tasks, taskId);
  return path.map(task => task.name).join(separator);
}

/**
 * Check if a task can be deleted based on strategy
 */
export function canDeleteTask(
  tasks: Task[], 
  taskId: string, 
  strategy: TaskDeletionStrategy
): { canDelete: boolean; reason?: string; affectedTasks?: Task[] } {
  const childTasks = getChildTasks(tasks, taskId);
  
  switch (strategy) {
    case 'prevent':
      if (childTasks.length > 0) {
        return {
          canDelete: false,
          reason: `Cannot delete task with ${childTasks.length} child task(s). Delete or move child tasks first.`,
          affectedTasks: childTasks,
        };
      }
      break;
      
    case 'cascade':
      return {
        canDelete: true,
        reason: childTasks.length > 0 
          ? `Will also delete ${childTasks.length} child task(s).`
          : undefined,
        affectedTasks: childTasks,
      };
      
    case 'orphan':
      return {
        canDelete: true,
        reason: childTasks.length > 0 
          ? `Will orphan ${childTasks.length} child task(s) (move to root level).`
          : undefined,
        affectedTasks: childTasks,
      };
  }
  
  return { canDelete: true };
}

/**
 * Prepare tasks for deletion based on strategy
 */
export function prepareTaskDeletion(
  tasks: Task[], 
  taskId: string, 
  strategy: TaskDeletionStrategy
): { tasksToDelete: string[]; tasksToUpdate: { id: string; updates: Partial<Task> }[] } {
  const childTasks = getChildTasks(tasks, taskId);
  const tasksToDelete: string[] = [taskId];
  const tasksToUpdate: { id: string; updates: Partial<Task> }[] = [];
  
  switch (strategy) {
    case 'cascade':
      // Delete all child tasks
      tasksToDelete.push(...childTasks.map(task => task.id));
      break;
      
    case 'orphan':
      // Move child tasks to root level (remove parentId)
      childTasks
        .filter(task => task.parentId === taskId) // Only direct children
        .forEach(task => {
          tasksToUpdate.push({
            id: task.id,
            updates: { parentId: null, childOrder: undefined },
          });
        });
      break;
      
    case 'prevent':
      // Only delete if no children (should be checked before calling this)
      if (childTasks.length > 0) {
        throw new Error('Cannot delete task with children when using prevent strategy');
      }
      break;
  }
  
  return { tasksToDelete, tasksToUpdate };
}

/**
 * Validate task hierarchy (prevent circular references)
 */
export function validateTaskHierarchy(tasks: Task[], taskId: string, newParentId: string | null): boolean {
  if (!newParentId) {
    return true; // Moving to root is always valid
  }
  
  if (taskId === newParentId) {
    return false; // Task cannot be its own parent
  }
  
  // Check if newParentId is a descendant of taskId (would create circular reference)
  const descendants = getChildTasks(tasks, taskId);
  return !descendants.some(descendant => descendant.id === newParentId);
}

/**
 * Get the next child order for a parent task
 */
export function getNextChildOrder(tasks: Task[], parentId: string | null): number {
  const siblings = tasks.filter(task => task.parentId === parentId);
  const maxOrder = Math.max(0, ...siblings.map(task => task.childOrder || 0));
  return maxOrder + 1;
}

/**
 * Reorder child tasks
 */
export function reorderChildTasks(
  tasks: Task[], 
  parentId: string | null, 
  orderedChildIds: string[]
): { id: string; updates: Partial<Task> }[] {
  const updates: { id: string; updates: Partial<Task> }[] = [];
  
  orderedChildIds.forEach((childId, index) => {
    const task = tasks.find(t => t.id === childId);
    if (task && task.parentId === parentId) {
      updates.push({
        id: childId,
        updates: { childOrder: index },
      });
    }
  });
  
  return updates;
}
