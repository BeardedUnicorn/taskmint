/**
 * Tests for task hierarchy utilities
 */

import {
  buildTaskHierarchy,
  // flattenTaskHierarchy, // Commented out unused import
  getChildTasks,
  getParentTask,
  getTaskPath,
  getTaskDisplayName,
  canDeleteTask,
  prepareTaskDeletion,
  validateTaskHierarchy,
  getNextChildOrder,
} from '../taskHierarchy';
import { Task } from '../../types/task';

describe('taskHierarchy utilities', () => {
  const mockTasks: Task[] = [
    {
      id: 'root1',
      name: 'Project A',
      parentId: null,
      childOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'root2',
      name: 'Project B',
      parentId: null,
      childOrder: 1,
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
    {
      id: 'child1',
      name: 'Task A1',
      parentId: 'root1',
      childOrder: 0,
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
    },
    {
      id: 'child2',
      name: 'Task A2',
      parentId: 'root1',
      childOrder: 1,
      createdAt: '2024-01-04T00:00:00Z',
      updatedAt: '2024-01-04T00:00:00Z',
    },
    {
      id: 'grandchild1',
      name: 'Subtask A1.1',
      parentId: 'child1',
      childOrder: 0,
      createdAt: '2024-01-05T00:00:00Z',
      updatedAt: '2024-01-05T00:00:00Z',
    },
  ];

  describe('buildTaskHierarchy', () => {
    it('should build correct hierarchy structure', () => {
      const hierarchy = buildTaskHierarchy(mockTasks);

      expect(hierarchy).toHaveLength(2); // Two root tasks
      expect(hierarchy[0].task.name).toBe('Project A');
      expect(hierarchy[0].children).toHaveLength(2);
      expect(hierarchy[0].children[0].task.name).toBe('Task A1');
      expect(hierarchy[0].children[0].children).toHaveLength(1);
      expect(hierarchy[0].children[0].children[0].task.name).toBe('Subtask A1.1');
    });

    it('should set correct depth and path', () => {
      const hierarchy = buildTaskHierarchy(mockTasks);

      expect(hierarchy[0].depth).toBe(0);
      expect(hierarchy[0].path).toEqual([]);
      
      expect(hierarchy[0].children[0].depth).toBe(1);
      expect(hierarchy[0].children[0].path).toEqual(['Project A']);
      
      expect(hierarchy[0].children[0].children[0].depth).toBe(2);
      expect(hierarchy[0].children[0].children[0].path).toEqual(['Project A', 'Task A1']);
    });

    it('should handle empty task array', () => {
      const hierarchy = buildTaskHierarchy([]);
      expect(hierarchy).toEqual([]);
    });
  });

  describe('getChildTasks', () => {
    it('should return all child tasks recursively', () => {
      const children = getChildTasks(mockTasks, 'root1');
      expect(children).toHaveLength(3); // child1, child2, grandchild1
      expect(children.map(t => t.id)).toContain('child1');
      expect(children.map(t => t.id)).toContain('child2');
      expect(children.map(t => t.id)).toContain('grandchild1');
    });

    it('should return direct children only for leaf nodes', () => {
      const children = getChildTasks(mockTasks, 'child2');
      expect(children).toHaveLength(0);
    });

    it('should return empty array for non-existent parent', () => {
      const children = getChildTasks(mockTasks, 'nonexistent');
      expect(children).toEqual([]);
    });
  });

  describe('getParentTask', () => {
    it('should return parent task', () => {
      const parent = getParentTask(mockTasks, 'child1');
      expect(parent?.id).toBe('root1');
      expect(parent?.name).toBe('Project A');
    });

    it('should return undefined for root tasks', () => {
      const parent = getParentTask(mockTasks, 'root1');
      expect(parent).toBeUndefined();
    });

    it('should return undefined for non-existent task', () => {
      const parent = getParentTask(mockTasks, 'nonexistent');
      expect(parent).toBeUndefined();
    });
  });

  describe('getTaskPath', () => {
    it('should return full path from root to task', () => {
      const path = getTaskPath(mockTasks, 'grandchild1');
      expect(path).toHaveLength(3);
      expect(path.map(t => t.name)).toEqual(['Project A', 'Task A1', 'Subtask A1.1']);
    });

    it('should return single task for root tasks', () => {
      const path = getTaskPath(mockTasks, 'root1');
      expect(path).toHaveLength(1);
      expect(path[0].name).toBe('Project A');
    });

    it('should return empty array for non-existent task', () => {
      const path = getTaskPath(mockTasks, 'nonexistent');
      expect(path).toEqual([]);
    });
  });

  describe('getTaskDisplayName', () => {
    it('should return hierarchical display name', () => {
      const displayName = getTaskDisplayName(mockTasks, 'grandchild1');
      expect(displayName).toBe('Project A > Task A1 > Subtask A1.1');
    });

    it('should use custom separator', () => {
      const displayName = getTaskDisplayName(mockTasks, 'grandchild1', ' / ');
      expect(displayName).toBe('Project A / Task A1 / Subtask A1.1');
    });

    it('should return task name for root tasks', () => {
      const displayName = getTaskDisplayName(mockTasks, 'root1');
      expect(displayName).toBe('Project A');
    });
  });

  describe('canDeleteTask', () => {
    it('should allow deletion with prevent strategy when no children', () => {
      const result = canDeleteTask(mockTasks, 'grandchild1', 'prevent');
      expect(result.canDelete).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should prevent deletion with prevent strategy when has children', () => {
      const result = canDeleteTask(mockTasks, 'root1', 'prevent');
      expect(result.canDelete).toBe(false);
      expect(result.reason).toContain('Cannot delete task with 3 child task(s)');
    });

    it('should allow deletion with cascade strategy', () => {
      const result = canDeleteTask(mockTasks, 'root1', 'cascade');
      expect(result.canDelete).toBe(true);
      expect(result.reason).toContain('Will also delete 3 child task(s)');
    });

    it('should allow deletion with orphan strategy', () => {
      const result = canDeleteTask(mockTasks, 'root1', 'orphan');
      expect(result.canDelete).toBe(true);
      expect(result.reason).toContain('Will orphan 3 child task(s)');
    });
  });

  describe('prepareTaskDeletion', () => {
    it('should prepare cascade deletion', () => {
      const result = prepareTaskDeletion(mockTasks, 'root1', 'cascade');
      expect(result.tasksToDelete).toContain('root1');
      expect(result.tasksToDelete).toContain('child1');
      expect(result.tasksToDelete).toContain('child2');
      expect(result.tasksToDelete).toContain('grandchild1');
      expect(result.tasksToUpdate).toHaveLength(0);
    });

    it('should prepare orphan deletion', () => {
      const result = prepareTaskDeletion(mockTasks, 'root1', 'orphan');
      expect(result.tasksToDelete).toEqual(['root1']);
      expect(result.tasksToUpdate).toHaveLength(2); // child1 and child2
      expect(result.tasksToUpdate[0].updates.parentId).toBeNull();
    });

    it('should prepare prevent deletion', () => {
      const result = prepareTaskDeletion(mockTasks, 'grandchild1', 'prevent');
      expect(result.tasksToDelete).toEqual(['grandchild1']);
      expect(result.tasksToUpdate).toHaveLength(0);
    });
  });

  describe('validateTaskHierarchy', () => {
    it('should allow moving to root', () => {
      const isValid = validateTaskHierarchy(mockTasks, 'child1', null);
      expect(isValid).toBe(true);
    });

    it('should prevent task from being its own parent', () => {
      const isValid = validateTaskHierarchy(mockTasks, 'child1', 'child1');
      expect(isValid).toBe(false);
    });

    it('should prevent circular references', () => {
      const isValid = validateTaskHierarchy(mockTasks, 'root1', 'grandchild1');
      expect(isValid).toBe(false);
    });

    it('should allow valid parent assignment', () => {
      const isValid = validateTaskHierarchy(mockTasks, 'child2', 'child1');
      expect(isValid).toBe(true);
    });
  });

  describe('getNextChildOrder', () => {
    it('should return next order for existing parent', () => {
      const nextOrder = getNextChildOrder(mockTasks, 'root1');
      expect(nextOrder).toBe(2); // child1 has order 0, child2 has order 1
    });

    it('should return 1 for parent with no children', () => {
      const nextOrder = getNextChildOrder(mockTasks, 'child2');
      expect(nextOrder).toBe(1);
    });

    it('should return undefined for root level', () => {
      const nextOrder = getNextChildOrder(mockTasks, null);
      expect(nextOrder).toBe(2); // root1 has order 0, root2 has order 1
    });
  });
});
