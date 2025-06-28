/**
 * Tests for earningsCalculator utility functions
 * 
 * Comprehensive test suite covering all earnings calculation scenarios
 */

import {
  calculateTotalEarningsForDate,
  calculateEntryEarnings,
  findTaskForEntry,
  calculateTotalEarningsForDateRange,
  calculateEarningsBreakdownForDate,
  calculateEarningsStats,
  getTodayDateString,
  EarningsStats,
} from '../earningsCalculator';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';

describe('earningsCalculator', () => {
  // Mock data setup
  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Development',
      hourlyRate: 100,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'task-2',
      name: 'Design',
      hourlyRate: 75,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'task-3',
      name: 'Meeting',
      hourlyRate: 0, // No rate
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'task-4',
      name: 'Research',
      // No hourlyRate property
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];

  const mockTimeEntries: TimeEntry[] = [
    {
      id: 'entry-1',
      taskName: 'Development',
      taskId: 'task-1',
      startTime: new Date('2024-01-01T09:00:00.000Z'),
      endTime: new Date('2024-01-01T11:00:00.000Z'),
      duration: 2 * 60 * 60 * 1000, // 2 hours
      isRunning: false,
      date: '2024-01-01',
    },
    {
      id: 'entry-2',
      taskName: 'Design',
      taskId: 'task-2',
      startTime: new Date('2024-01-01T13:00:00.000Z'),
      endTime: new Date('2024-01-01T14:30:00.000Z'),
      duration: 1.5 * 60 * 60 * 1000, // 1.5 hours
      isRunning: false,
      date: '2024-01-01',
    },
    {
      id: 'entry-3',
      taskName: 'Development',
      taskId: 'task-1',
      startTime: new Date('2024-01-02T10:00:00.000Z'),
      endTime: new Date('2024-01-02T12:00:00.000Z'),
      duration: 2 * 60 * 60 * 1000, // 2 hours
      isRunning: false,
      date: '2024-01-02',
    },
    {
      id: 'entry-4',
      taskName: 'Meeting',
      taskId: 'task-3',
      startTime: new Date('2024-01-01T15:00:00.000Z'),
      endTime: new Date('2024-01-01T16:00:00.000Z'),
      duration: 1 * 60 * 60 * 1000, // 1 hour
      isRunning: false,
      date: '2024-01-01',
    },
    {
      id: 'entry-5',
      taskName: 'Development',
      taskId: 'task-1',
      startTime: new Date('2024-01-01T16:00:00.000Z'),
      // Still running
      isRunning: true,
      date: '2024-01-01',
    },
    {
      id: 'entry-6',
      taskName: 'Unknown Task',
      // No taskId, task not in list
      startTime: new Date('2024-01-01T17:00:00.000Z'),
      endTime: new Date('2024-01-01T18:00:00.000Z'),
      duration: 1 * 60 * 60 * 1000, // 1 hour
      isRunning: false,
      date: '2024-01-01',
    },
    {
      id: 'entry-7',
      taskName: 'Research',
      taskId: 'task-4',
      startTime: new Date('2024-01-03T09:00:00.000Z'),
      endTime: new Date('2024-01-03T10:00:00.000Z'),
      duration: 1 * 60 * 60 * 1000, // 1 hour
      isRunning: false,
      date: '2024-01-03',
    },
  ];

  describe('calculateEntryEarnings', () => {
    it('should calculate earnings for completed entry with valid task', () => {
      const entry = mockTimeEntries[0]; // Development, 2 hours
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(200); // 2 hours * $100/hour
    });

    it('should calculate earnings for partial hours', () => {
      const entry = mockTimeEntries[1]; // Design, 1.5 hours
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(112.5); // 1.5 hours * $75/hour
    });

    it('should return 0 for running entries', () => {
      const entry = mockTimeEntries[4]; // Running entry
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should return 0 for entries without duration', () => {
      const entry: TimeEntry = {
        ...mockTimeEntries[0],
        duration: undefined,
      };
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should return 0 for entries with zero duration', () => {
      const entry: TimeEntry = {
        ...mockTimeEntries[0],
        duration: 0,
      };
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should return 0 for tasks with zero hourly rate', () => {
      const entry = mockTimeEntries[3]; // Meeting with $0/hour
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should return 0 for tasks without hourly rate', () => {
      const entry = mockTimeEntries[6]; // Research with no hourlyRate
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should return 0 for entries with unknown tasks', () => {
      const entry = mockTimeEntries[5]; // Unknown Task
      const earnings = calculateEntryEarnings(entry, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should handle negative hourly rates', () => {
      const taskWithNegativeRate: Task = {
        ...mockTasks[0],
        hourlyRate: -50,
      };
      const earnings = calculateEntryEarnings(mockTimeEntries[0], [taskWithNegativeRate]);
      expect(earnings).toBe(0);
    });
  });

  describe('findTaskForEntry', () => {
    it('should find task by ID when taskId is provided', () => {
      const entry = mockTimeEntries[0]; // Has taskId
      const task = findTaskForEntry(entry, mockTasks);
      expect(task).toBe(mockTasks[0]);
      expect(task?.id).toBe('task-1');
    });

    it('should fall back to finding by name when taskId not found', () => {
      const entry: TimeEntry = {
        ...mockTimeEntries[0],
        taskId: 'non-existent-id',
        taskName: 'Development',
      };
      const task = findTaskForEntry(entry, mockTasks);
      expect(task).toBe(mockTasks[0]);
      expect(task?.name).toBe('Development');
    });

    it('should find task by name when no taskId provided', () => {
      const entry: TimeEntry = {
        ...mockTimeEntries[0],
        taskId: undefined,
        taskName: 'Design',
      };
      const task = findTaskForEntry(entry, mockTasks);
      expect(task).toBe(mockTasks[1]);
      expect(task?.name).toBe('Design');
    });

    it('should return undefined when task not found', () => {
      const entry = mockTimeEntries[5]; // Unknown Task
      const task = findTaskForEntry(entry, mockTasks);
      expect(task).toBeUndefined();
    });

    it('should return undefined when no taskId and name not found', () => {
      const entry: TimeEntry = {
        ...mockTimeEntries[0],
        taskId: undefined,
        taskName: 'Non-existent Task',
      };
      const task = findTaskForEntry(entry, mockTasks);
      expect(task).toBeUndefined();
    });
  });

  describe('calculateTotalEarningsForDate', () => {
    it('should calculate total earnings for a specific date', () => {
      const earnings = calculateTotalEarningsForDate('2024-01-01', mockTimeEntries, mockTasks);
      // Development: 2 hours * $100 = $200
      // Design: 1.5 hours * $75 = $112.5
      // Meeting: 1 hour * $0 = $0
      // Running entry: $0
      // Unknown task: $0
      expect(earnings).toBe(312.5);
    });

    it('should return 0 for date with no entries', () => {
      const earnings = calculateTotalEarningsForDate('2024-01-05', mockTimeEntries, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should return 0 for date with only running entries', () => {
      const runningEntries: TimeEntry[] = [
        {
          ...mockTimeEntries[0],
          date: '2024-01-10',
          isRunning: true,
        },
      ];
      const earnings = calculateTotalEarningsForDate('2024-01-10', runningEntries, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should handle empty time entries array', () => {
      const earnings = calculateTotalEarningsForDate('2024-01-01', [], mockTasks);
      expect(earnings).toBe(0);
    });

    it('should handle empty tasks array', () => {
      const earnings = calculateTotalEarningsForDate('2024-01-01', mockTimeEntries, []);
      expect(earnings).toBe(0);
    });
  });

  describe('calculateTotalEarningsForDateRange', () => {
    it('should calculate total earnings for a date range', () => {
      const earnings = calculateTotalEarningsForDateRange('2024-01-01', '2024-01-02', mockTimeEntries, mockTasks);
      // 2024-01-01: $312.5 (as calculated above)
      // 2024-01-02: Development 2 hours * $100 = $200
      expect(earnings).toBe(512.5);
    });

    it('should handle single day range', () => {
      const earnings = calculateTotalEarningsForDateRange('2024-01-01', '2024-01-01', mockTimeEntries, mockTasks);
      expect(earnings).toBe(312.5);
    });

    it('should return 0 for range with no entries', () => {
      const earnings = calculateTotalEarningsForDateRange('2024-01-10', '2024-01-15', mockTimeEntries, mockTasks);
      expect(earnings).toBe(0);
    });

    it('should handle inclusive date range boundaries', () => {
      const earnings = calculateTotalEarningsForDateRange('2024-01-02', '2024-01-03', mockTimeEntries, mockTasks);
      // 2024-01-02: Development 2 hours * $100 = $200
      // 2024-01-03: Research 1 hour * no rate = $0
      expect(earnings).toBe(200);
    });

    it('should handle reverse date range (end before start)', () => {
      const earnings = calculateTotalEarningsForDateRange('2024-01-03', '2024-01-01', mockTimeEntries, mockTasks);
      expect(earnings).toBe(0); // No entries match the filter criteria
    });
  });

  describe('calculateEarningsBreakdownForDate', () => {
    it('should calculate earnings breakdown by task for a specific date', () => {
      const breakdown = calculateEarningsBreakdownForDate('2024-01-01', mockTimeEntries, mockTasks);
      expect(breakdown).toEqual({
        'Development': 200, // 2 hours * $100
        'Design': 112.5,    // 1.5 hours * $75
        // Meeting and Unknown Task have $0 earnings, so not included
      });
    });

    it('should return empty object for date with no earnings', () => {
      const breakdown = calculateEarningsBreakdownForDate('2024-01-03', mockTimeEntries, mockTasks);
      expect(breakdown).toEqual({}); // Research has no hourly rate
    });

    it('should return empty object for date with no entries', () => {
      const breakdown = calculateEarningsBreakdownForDate('2024-01-05', mockTimeEntries, mockTasks);
      expect(breakdown).toEqual({});
    });

    it('should aggregate multiple entries for same task', () => {
      const additionalEntries: TimeEntry[] = [
        ...mockTimeEntries,
        {
          id: 'entry-8',
          taskName: 'Development',
          taskId: 'task-1',
          startTime: new Date('2024-01-01T20:00:00.000Z'),
          endTime: new Date('2024-01-01T21:00:00.000Z'),
          duration: 1 * 60 * 60 * 1000, // 1 hour
          isRunning: false,
          date: '2024-01-01',
        },
      ];
      const breakdown = calculateEarningsBreakdownForDate('2024-01-01', additionalEntries, mockTasks);
      expect(breakdown).toEqual({
        'Development': 300, // (2 + 1) hours * $100
        'Design': 112.5,    // 1.5 hours * $75
      });
    });
  });

  describe('calculateEarningsStats', () => {
    it('should calculate comprehensive earnings statistics', () => {
      const stats = calculateEarningsStats('2024-01-01', '2024-01-03', mockTimeEntries, mockTasks);

      expect(stats.totalEarnings).toBe(512.5); // $312.5 + $200 + $0
      expect(stats.totalDays).toBe(3);
      expect(stats.daysWithEarnings).toBe(2);
      expect(stats.averageEarningsPerDay).toBeCloseTo(512.5 / 3, 2);
      expect(stats.highestDayEarnings).toBe(312.5);
      expect(stats.lowestDayEarnings).toBe(200); // Excludes days with $0
      expect(stats.earningsByDate).toEqual({
        '2024-01-01': 312.5,
        '2024-01-02': 200,
        '2024-01-03': 0,
      });
    });

    it('should handle single day range', () => {
      const stats = calculateEarningsStats('2024-01-01', '2024-01-01', mockTimeEntries, mockTasks);

      expect(stats.totalEarnings).toBe(312.5);
      expect(stats.totalDays).toBe(1);
      expect(stats.daysWithEarnings).toBe(1);
      expect(stats.averageEarningsPerDay).toBe(312.5);
      expect(stats.highestDayEarnings).toBe(312.5);
      expect(stats.lowestDayEarnings).toBe(312.5);
    });

    it('should handle range with no earnings', () => {
      const stats = calculateEarningsStats('2024-01-10', '2024-01-12', mockTimeEntries, mockTasks);

      expect(stats.totalEarnings).toBe(0);
      expect(stats.totalDays).toBe(3);
      expect(stats.daysWithEarnings).toBe(0);
      expect(stats.averageEarningsPerDay).toBe(0);
      expect(stats.highestDayEarnings).toBe(0);
      expect(stats.lowestDayEarnings).toBe(0);
    });

    it('should handle range with all zero earnings days', () => {
      const zeroEarningsEntries: TimeEntry[] = [
        {
          id: 'entry-zero',
          taskName: 'Meeting',
          taskId: 'task-3',
          startTime: new Date('2024-01-10T09:00:00.000Z'),
          endTime: new Date('2024-01-10T10:00:00.000Z'),
          duration: 1 * 60 * 60 * 1000,
          isRunning: false,
          date: '2024-01-10',
        },
      ];
      const stats = calculateEarningsStats('2024-01-10', '2024-01-10', zeroEarningsEntries, mockTasks);

      expect(stats.totalEarnings).toBe(0);
      expect(stats.daysWithEarnings).toBe(0);
      expect(stats.lowestDayEarnings).toBe(0);
    });
  });

  describe('getTodayDateString', () => {
    it('should return today\'s date in YYYY-MM-DD format', () => {
      const mockDate = new Date('2024-01-15T14:30:00.000Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const dateString = getTodayDateString();
      expect(dateString).toBe('2024-01-15');

      vi.restoreAllMocks();
    });

    it('should handle different timezones consistently', () => {
      // Test with a date that might have timezone issues
      const mockDate = new Date('2024-12-31T23:59:59.999Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const dateString = getTodayDateString();
      expect(dateString).toBe('2024-12-31');

      vi.restoreAllMocks();
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle very large durations', () => {
      const largeEntry: TimeEntry = {
        id: 'large-entry',
        taskName: 'Development',
        taskId: 'task-1',
        startTime: new Date('2024-01-01T00:00:00.000Z'),
        endTime: new Date('2024-01-01T23:59:59.999Z'),
        duration: 24 * 60 * 60 * 1000 - 1, // Almost 24 hours
        isRunning: false,
        date: '2024-01-01',
      };

      const earnings = calculateEntryEarnings(largeEntry, mockTasks);
      expect(earnings).toBeCloseTo(2400, 0); // ~24 hours * $100
    });

    it('should handle very small durations', () => {
      const smallEntry: TimeEntry = {
        id: 'small-entry',
        taskName: 'Development',
        taskId: 'task-1',
        startTime: new Date('2024-01-01T09:00:00.000Z'),
        endTime: new Date('2024-01-01T09:00:01.000Z'),
        duration: 1000, // 1 second
        isRunning: false,
        date: '2024-01-01',
      };

      const earnings = calculateEntryEarnings(smallEntry, mockTasks);
      expect(earnings).toBeCloseTo(0.0278, 4); // 1/3600 hours * $100
    });

    it('should handle very high hourly rates', () => {
      const expensiveTask: Task = {
        id: 'task-1', // Use same ID as mockTimeEntries[0]
        name: 'Development',
        hourlyRate: 10000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const earnings = calculateEntryEarnings(mockTimeEntries[0], [expensiveTask]);
      expect(earnings).toBe(20000); // 2 hours * $10,000
    });

    it('should handle fractional hourly rates', () => {
      const fractionalTask: Task = {
        id: 'task-1', // Use same ID as mockTimeEntries[0]
        name: 'Development',
        hourlyRate: 33.33,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const earnings = calculateEntryEarnings(mockTimeEntries[0], [fractionalTask]);
      expect(earnings).toBeCloseTo(66.66, 2); // 2 hours * $33.33
    });
  });
});
