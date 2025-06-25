/**
 * Tests for chartDataHelpers utility functions
 * 
 * Comprehensive test suite covering all aggregation functions and data preparation
 */

import {
  aggregateByTask,
  aggregateByDay,
  aggregateByWeek,
  aggregateByMonth,
  millisecondsToHours,
  formatTimeForChart,
  generateChartColors,
  getChartTheme,
  prepareTaskDistributionData,
  TaskTimeData,
  DailyData,
  WeeklyData,
  MonthlyData,
} from '../chartDataHelpers';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';

// Don't mock dayjs - let it work normally for date formatting

describe('chartDataHelpers', () => {
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

  describe('aggregateByTask', () => {
    it('should aggregate time entries by task name', () => {
      const result = aggregateByTask(mockTimeEntries, mockTasks);

      expect(result).toHaveLength(5); // Development, Design, Meeting, Unknown Task, Research

      // Find Development task (should have highest total time)
      const devTask = result.find(task => task.taskName === 'Development');
      expect(devTask).toBeDefined();
      expect(devTask!.totalTime).toBe(4 * 60 * 60 * 1000); // 4 hours total
      expect(devTask!.totalEarnings).toBe(400); // 4 hours * $100
      expect(devTask!.entryCount).toBe(2); // 2 completed entries (running entry excluded)
    });

    it('should sort tasks by total time descending', () => {
      const result = aggregateByTask(mockTimeEntries, mockTasks);
      
      // Development should be first (4 hours), then others
      expect(result[0].taskName).toBe('Development');
      expect(result[0].totalTime).toBe(4 * 60 * 60 * 1000);
    });

    it('should handle entries without duration', () => {
      const entriesWithoutDuration: TimeEntry[] = [
        {
          ...mockTimeEntries[0],
          duration: undefined,
        },
        mockTimeEntries[1], // Has duration
      ];
      
      const result = aggregateByTask(entriesWithoutDuration, mockTasks);
      
      // Should only include the entry with duration
      expect(result).toHaveLength(1);
      expect(result[0].taskName).toBe('Design');
    });

    it('should handle tasks without hourly rates', () => {
      const result = aggregateByTask(mockTimeEntries, mockTasks);
      
      const meetingTask = result.find(task => task.taskName === 'Meeting');
      expect(meetingTask).toBeDefined();
      expect(meetingTask!.totalEarnings).toBe(0); // No hourly rate
      
      const researchTask = result.find(task => task.taskName === 'Research');
      expect(researchTask).toBeDefined();
      expect(researchTask!.totalEarnings).toBe(0); // No hourlyRate property
    });

    it('should handle unknown tasks', () => {
      const result = aggregateByTask(mockTimeEntries, mockTasks);
      
      const unknownTask = result.find(task => task.taskName === 'Unknown Task');
      expect(unknownTask).toBeDefined();
      expect(unknownTask!.totalEarnings).toBe(0); // Task not found in tasks array
    });

    it('should handle empty arrays', () => {
      expect(aggregateByTask([], mockTasks)).toEqual([]);
      expect(aggregateByTask(mockTimeEntries, [])).toHaveLength(5); // Still aggregates by task name
    });
  });

  describe('aggregateByDay', () => {
    it('should aggregate time entries by day', () => {
      const result = aggregateByDay(mockTimeEntries, mockTasks);
      
      expect(result).toHaveLength(3); // 3 different dates
      
      // Check 2024-01-01 (should have most entries)
      const jan01 = result.find(day => day.date === '2024-01-01');
      expect(jan01).toBeDefined();
      expect(jan01!.totalTime).toBe(5.5 * 60 * 60 * 1000); // 2 + 1.5 + 1 + 1 hours (excluding running entry)
      expect(jan01!.totalEarnings).toBe(312.5); // 200 + 112.5 + 0 + 0
      expect(jan01!.entryCount).toBe(4); // 4 completed entries
    });

    it('should sort days by date ascending', () => {
      const result = aggregateByDay(mockTimeEntries, mockTasks);
      
      expect(result[0].date).toBe('2024-01-01');
      expect(result[1].date).toBe('2024-01-02');
      expect(result[2].date).toBe('2024-01-03');
    });

    it('should use startTime for date calculation', () => {
      const entriesWithDifferentDates: TimeEntry[] = [
        {
          ...mockTimeEntries[0],
          startTime: new Date('2024-01-01T23:30:00.000Z'), // Late at night
          date: '2024-01-01',
        },
        {
          ...mockTimeEntries[1],
          startTime: new Date('2024-01-02T00:30:00.000Z'), // Early next day
          date: '2024-01-02',
        },
      ];
      
      const result = aggregateByDay(entriesWithDifferentDates, mockTasks);
      
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[1].date).toBe('2024-01-02');
    });
  });

  describe('aggregateByWeek', () => {
    it('should aggregate time entries by week', () => {
      const result = aggregateByWeek(mockTimeEntries, mockTasks);

      // All entries should fall within the same week (depending on week start)
      expect(result.length).toBeGreaterThan(0);

      // Check that week labels are strings (format may vary based on dayjs implementation)
      result.forEach(week => {
        expect(typeof week.week).toBe('string');
        expect(week.week.length).toBeGreaterThan(0);
      });
    });

    it('should sort weeks chronologically', () => {
      const result = aggregateByWeek(mockTimeEntries, mockTasks);
      
      if (result.length > 1) {
        // Verify sorting by checking that dates are in order
        for (let i = 1; i < result.length; i++) {
          const prevWeekStart = result[i - 1].week.split(' - ')[0];
          const currWeekStart = result[i].week.split(' - ')[0];
          // This is a basic check - in real implementation dayjs would handle proper comparison
          expect(prevWeekStart <= currWeekStart).toBe(true);
        }
      }
    });
  });

  describe('aggregateByMonth', () => {
    it('should aggregate time entries by month', () => {
      const result = aggregateByMonth(mockTimeEntries, mockTasks);

      // Should have some aggregated data
      expect(result.length).toBeGreaterThan(0);

      // Check that month labels are strings
      result.forEach(monthData => {
        expect(typeof monthData.month).toBe('string');
        expect(monthData.month.length).toBeGreaterThan(0);
      });

      // Should aggregate entries with duration
      const totalExpectedTime = mockTimeEntries
        .filter(entry => entry.duration)
        .reduce((sum, entry) => sum + entry.duration!, 0);
      const totalResultTime = result.reduce((sum, monthData) => sum + monthData.totalTime, 0);
      expect(totalResultTime).toBe(totalExpectedTime);
    });

    it('should handle multiple months', () => {
      const multiMonthEntries: TimeEntry[] = [
        {
          ...mockTimeEntries[0],
          startTime: new Date('2024-01-15T09:00:00.000Z'),
        },
        {
          ...mockTimeEntries[1],
          startTime: new Date('2024-02-15T09:00:00.000Z'),
        },
        {
          ...mockTimeEntries[2],
          startTime: new Date('2024-03-15T09:00:00.000Z'),
        },
      ];

      const result = aggregateByMonth(multiMonthEntries, mockTasks);

      expect(result).toHaveLength(3);
      // Check that we have 3 different month strings
      const monthStrings = result.map(r => r.month);
      expect(new Set(monthStrings).size).toBe(3); // All unique
    });
  });

  describe('millisecondsToHours', () => {
    it('should convert milliseconds to hours with 2 decimal places', () => {
      expect(millisecondsToHours(3600000)).toBe(1); // 1 hour
      expect(millisecondsToHours(1800000)).toBe(0.5); // 30 minutes
      expect(millisecondsToHours(5400000)).toBe(1.5); // 1.5 hours
      expect(millisecondsToHours(1000)).toBe(0); // 1 second (rounds to 0.00)
    });

    it('should handle zero and negative values', () => {
      expect(millisecondsToHours(0)).toBe(0);
      expect(millisecondsToHours(-3600000)).toBe(-1);
    });

    it('should handle very large values', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      expect(millisecondsToHours(oneDay)).toBe(24);
    });
  });

  describe('formatTimeForChart', () => {
    it('should format time as hours and minutes', () => {
      expect(formatTimeForChart(3600000)).toBe('1h 0m'); // 1 hour
      expect(formatTimeForChart(1800000)).toBe('0h 30m'); // 30 minutes
      expect(formatTimeForChart(5400000)).toBe('1h 30m'); // 1.5 hours
      expect(formatTimeForChart(90000)).toBe('0h 1m'); // 1.5 minutes
    });

    it('should handle zero and very small values', () => {
      expect(formatTimeForChart(0)).toBe('0h 0m');
      expect(formatTimeForChart(30000)).toBe('0h 0m'); // 30 seconds
    });

    it('should handle large values', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      expect(formatTimeForChart(oneDay)).toBe('24h 0m');
    });
  });

  describe('generateChartColors', () => {
    it('should generate the requested number of colors', () => {
      expect(generateChartColors(5)).toHaveLength(5);
      expect(generateChartColors(0)).toHaveLength(0);
      expect(generateChartColors(1)).toHaveLength(1);
    });

    it('should cycle through colors when count exceeds available colors', () => {
      const colors = generateChartColors(20); // More than the 15 predefined colors
      expect(colors).toHaveLength(20);
      
      // First color should repeat at position 15
      expect(colors[0]).toBe(colors[15]);
    });

    it('should return valid hex color codes', () => {
      const colors = generateChartColors(5);
      colors.forEach(color => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe('getChartTheme', () => {
    it('should return dark theme colors when isDarkMode is true', () => {
      const theme = getChartTheme(true);
      
      expect(theme.backgroundColor).toBe('#121212');
      expect(theme.textColor).toBe('#ffffff');
      expect(theme.gridColor).toBe('#333333');
      expect(theme.tooltipBackground).toBe('#333333');
      expect(theme.tooltipBorder).toBe('#555555');
    });

    it('should return light theme colors when isDarkMode is false', () => {
      const theme = getChartTheme(false);
      
      expect(theme.backgroundColor).toBe('#ffffff');
      expect(theme.textColor).toBe('#000000');
      expect(theme.gridColor).toBe('#e0e0e0');
      expect(theme.tooltipBackground).toBe('#ffffff');
      expect(theme.tooltipBorder).toBe('#cccccc');
    });
  });

  describe('prepareTaskDistributionData', () => {
    it('should prepare data for pie chart with percentages', () => {
      const result = prepareTaskDistributionData(mockTimeEntries);
      
      expect(result.length).toBeGreaterThan(0);
      
      // Check that percentages add up to 100 (approximately)
      const totalPercentage = result.reduce((sum, item) => sum + item.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);
      
      // Check data structure
      result.forEach(item => {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('value');
        expect(item).toHaveProperty('percentage');
        expect(typeof item.name).toBe('string');
        expect(typeof item.value).toBe('number');
        expect(typeof item.percentage).toBe('number');
      });
    });

    it('should handle empty entries array', () => {
      const result = prepareTaskDistributionData([]);
      expect(result).toEqual([]);
    });

    it('should convert time values to hours', () => {
      const result = prepareTaskDistributionData(mockTimeEntries);
      
      result.forEach(item => {
        expect(item.value).toBeGreaterThanOrEqual(0);
        // Value should be in hours (much smaller than milliseconds)
        expect(item.value).toBeLessThan(1000);
      });
    });
  });
});
