/**
 * Tests for useFavoriteTasks hook
 */

import { renderHook, act } from '@testing-library/react';
import { useFavoriteTasks } from '../useFavoriteTasks';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock useLocalStorage
vi.mock('../useLocalStorage', () => ({
  useLocalStorage: vi.fn((_key, defaultValue) => {
    const [value, setValue] = require('react').useState(defaultValue);
    return [value, setValue];
  }),
}));

describe('useFavoriteTasks', () => {
  const mockTasks: Task[] = [
    {
      id: 'task1',
      name: 'Task 1',
      hourlyRate: 50,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'task2',
      name: 'Task 2',
      hourlyRate: 75,
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
    {
      id: 'task3',
      name: 'Task 3',
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
    },
  ];

  const mockTimeEntries: TimeEntry[] = [
    {
      id: 'entry1',
      taskName: 'Task 1',
      taskId: 'task1',
      startTime: new Date('2024-01-10T09:00:00Z'),
      endTime: new Date('2024-01-10T10:00:00Z'),
      duration: 3600000, // 1 hour
      isRunning: false,
      date: '2024-01-10',
    },
    {
      id: 'entry2',
      taskName: 'Task 2',
      taskId: 'task2',
      startTime: new Date('2024-01-09T09:00:00Z'),
      endTime: new Date('2024-01-09T10:30:00Z'),
      duration: 5400000, // 1.5 hours
      isRunning: false,
      date: '2024-01-09',
    },
    {
      id: 'entry3',
      taskName: 'Task 1',
      taskId: 'task1',
      startTime: new Date('2024-01-08T09:00:00Z'),
      endTime: new Date('2024-01-08T09:30:00Z'),
      duration: 1800000, // 30 minutes
      isRunning: false,
      date: '2024-01-08',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty favorites', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, []));

    expect(result.current.favoriteTasks).toEqual([]);
    expect(result.current.recentTasks).toEqual([]);
    expect(result.current.quickAccessTasks).toEqual([]);
  });

  it('should calculate recent tasks based on time entries', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, mockTimeEntries));

    expect(result.current.recentTasks).toHaveLength(2);
    expect(result.current.recentTasks[0].taskName).toBe('Task 1'); // Most recent
    expect(result.current.recentTasks[1].taskName).toBe('Task 2');
  });

  it('should toggle favorite status', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, mockTimeEntries));

    // Initially not favorite
    expect(result.current.isFavorite('task1')).toBe(false);

    // Add to favorites
    act(() => {
      result.current.toggleFavorite('task1');
    });

    expect(result.current.isFavorite('task1')).toBe(true);
    expect(result.current.favoriteTasks).toHaveLength(1);
    expect(result.current.favoriteTasks[0].id).toBe('task1');

    // Remove from favorites
    act(() => {
      result.current.toggleFavorite('task1');
    });

    expect(result.current.isFavorite('task1')).toBe(false);
    expect(result.current.favoriteTasks).toHaveLength(0);
  });

  it('should add favorite', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, mockTimeEntries));

    act(() => {
      result.current.addFavorite('task2');
    });

    expect(result.current.isFavorite('task2')).toBe(true);
    expect(result.current.favoriteTasks).toHaveLength(1);
    expect(result.current.favoriteTasks[0].id).toBe('task2');
  });

  it('should remove favorite', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, mockTimeEntries));

    // First add a favorite
    act(() => {
      result.current.addFavorite('task1');
    });

    expect(result.current.isFavorite('task1')).toBe(true);

    // Then remove it
    act(() => {
      result.current.removeFavorite('task1');
    });

    expect(result.current.isFavorite('task1')).toBe(false);
    expect(result.current.favoriteTasks).toHaveLength(0);
  });

  it('should combine favorites and recent tasks in quickAccessTasks', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, mockTimeEntries));

    // Add task3 as favorite (not in recent tasks)
    act(() => {
      result.current.addFavorite('task3');
    });

    // Should include favorite task3 plus recent tasks (task1, task2)
    expect(result.current.quickAccessTasks).toHaveLength(3);
    expect(result.current.quickAccessTasks.map(t => t.id)).toContain('task3');
  });

  it('should calculate usage statistics correctly', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, mockTimeEntries));

    const task1WithUsage = result.current.tasksWithUsage.find(t => t.name === 'Task 1');
    const task2WithUsage = result.current.tasksWithUsage.find(t => t.name === 'Task 2');
    const task3WithUsage = result.current.tasksWithUsage.find(t => t.name === 'Task 3');

    expect(task1WithUsage?.usageCount).toBe(2); // 2 time entries
    expect(task2WithUsage?.usageCount).toBe(1); // 1 time entry
    expect(task3WithUsage?.usageCount).toBe(0); // 0 time entries

    expect(task1WithUsage?.lastUsed).toEqual(new Date('2024-01-10T09:00:00Z'));
    expect(task2WithUsage?.lastUsed).toEqual(new Date('2024-01-09T09:00:00Z'));
    expect(task3WithUsage?.lastUsed).toBeUndefined();
  });

  it('should respect maxRecentTasks setting', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, mockTimeEntries));

    // Set max recent tasks to 1
    act(() => {
      result.current.setMaxRecentTasks(1);
    });

    expect(result.current.recentTasks).toHaveLength(1);
    expect(result.current.recentTasks[0].taskName).toBe('Task 1'); // Most recent
  });

  it('should handle empty time entries', () => {
    const { result } = renderHook(() => useFavoriteTasks(mockTasks, []));

    expect(result.current.recentTasks).toEqual([]);
    expect(result.current.tasksWithUsage.every(t => t.usageCount === 0)).toBe(true);
  });

  it('should handle empty tasks', () => {
    const { result } = renderHook(() => useFavoriteTasks([], mockTimeEntries));

    expect(result.current.favoriteTasks).toEqual([]);
    expect(result.current.quickAccessTasks).toEqual([]);
    expect(result.current.tasksWithUsage).toEqual([]);
  });
});
