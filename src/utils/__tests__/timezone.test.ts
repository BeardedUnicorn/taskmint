/**
 * Timezone Handling Tests
 * 
 * Tests to verify that times are stored in UTC but displayed in local timezone
 * and that all calculations are done using the user's local timezone.
 */

import { vi } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { TimeEntry } from '../../types/timer';

// Import the actual dateHelpers functions
import {
  formatLocalTime,
  formatDateString,
  formatDateTimeLocal,
  formatLocalDate,
  getStartOfDay,
  getEndOfDay,
} from '../dateHelpers';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

describe('Timezone Handling', () => {
  // Use the current system timezone for testing
  const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  beforeAll(() => {
    console.log('Current timezone:', currentTimezone);
  });

  describe('UTC Storage with Local Display', () => {
    it('should store times in UTC but display in local timezone', () => {
      // Create a date in UTC
      const utcDate = new Date('2024-01-15T14:30:00.000Z'); // 2:30 PM UTC
      
      // When displayed in Mountain Time (UTC-7), should show as 7:30 AM
      const localTime = formatLocalTime(utcDate);
      
      // In January, Mountain Standard Time is in effect (UTC-7)
      expect(localTime).toBe('07:30');
    });

    it('should handle datetime-local format correctly', () => {
      const utcDate = new Date('2024-01-15T14:30:00.000Z'); // 2:30 PM UTC
      
      // Should format for datetime-local input in local timezone
      const localDateTime = formatDateTimeLocal(utcDate);
      
      // In Mountain Time (UTC-7), should be 7:30 AM
      expect(localDateTime).toBe('2024-01-15T07:30');
    });

    it('should handle date strings correctly', () => {
      const utcDate = new Date('2024-01-15T14:30:00.000Z');
      
      // Date should be formatted in local timezone
      const dateString = formatDateString(utcDate);
      
      // Should still be the same date in Mountain Time
      expect(dateString).toBe('2024-01-15');
    });

    it('should handle edge cases around midnight', () => {
      // UTC date that crosses midnight in local timezone
      const utcDate = new Date('2024-01-15T04:30:00.000Z'); // 4:30 AM UTC
      
      // In Mountain Time (UTC-7), this should be 9:30 PM on Jan 14
      const localTime = formatLocalTime(utcDate);
      const localDate = formatDateString(utcDate);
      
      expect(localTime).toBe('21:30');
      expect(localDate).toBe('2024-01-14'); // Previous day in local timezone
    });
  });

  describe('Time Entry Storage and Retrieval', () => {
    it('should serialize and deserialize time entries correctly', () => {
      const originalEntry: TimeEntry = {
        id: 'test-1',
        taskName: 'Test Task',
        startTime: new Date('2024-01-15T14:30:00.000Z'),
        endTime: new Date('2024-01-15T16:45:00.000Z'),
        duration: 2 * 60 * 60 * 1000 + 15 * 60 * 1000, // 2h 15m
        isRunning: false,
        date: '2024-01-15',
      };

      // Simulate storage serialization
      const serialized = JSON.stringify(originalEntry);
      const parsed = JSON.parse(serialized);
      
      // Simulate how StorageService converts back to Date objects
      const deserializedEntry: TimeEntry = {
        ...parsed,
        startTime: new Date(parsed.startTime),
        endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
      };

      // Verify dates are preserved correctly
      expect(deserializedEntry.startTime.toISOString()).toBe('2024-01-15T14:30:00.000Z');
      expect(deserializedEntry.endTime?.toISOString()).toBe('2024-01-15T16:45:00.000Z');
      
      // Verify local display (Mountain Time UTC-7)
      expect(formatLocalTime(deserializedEntry.startTime)).toBe('07:30');
      expect(formatLocalTime(deserializedEntry.endTime!)).toBe('09:45');
    });

    it('should handle running timers correctly', () => {
      const runningEntry: TimeEntry = {
        id: 'test-running',
        taskName: 'Running Task',
        startTime: new Date('2024-01-15T14:30:00.000Z'),
        isRunning: true,
        date: '2024-01-15',
      };

      // Serialize and deserialize
      const serialized = JSON.stringify(runningEntry);
      const parsed = JSON.parse(serialized);
      const deserializedEntry: TimeEntry = {
        ...parsed,
        startTime: new Date(parsed.startTime),
        endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
      };

      expect(deserializedEntry.isRunning).toBe(true);
      expect(deserializedEntry.endTime).toBeUndefined();
      expect(formatLocalTime(deserializedEntry.startTime)).toBe('07:30');
    });
  });

  describe('Date Calculations in Local Timezone', () => {
    it('should calculate start of day in local timezone', () => {
      const date = new Date('2024-01-15T14:30:00.000Z'); // 2:30 PM UTC, 7:30 AM MST
      
      const startOfDay = getStartOfDay(date);
      
      // Start of day should be midnight in local timezone
      // In MST, this would be 7:00 AM UTC (midnight MST + 7 hours)
      expect(startOfDay.toISOString()).toBe('2024-01-15T07:00:00.000Z');
    });

    it('should calculate end of day in local timezone', () => {
      const date = new Date('2024-01-15T14:30:00.000Z'); // 2:30 PM UTC, 7:30 AM MST
      
      const endOfDay = getEndOfDay(date);
      
      // End of day should be 23:59:59.999 in local timezone
      // In MST, this would be 6:59:59.999 AM UTC the next day
      expect(endOfDay.toISOString()).toBe('2024-01-16T06:59:59.999Z');
    });

    it('should filter entries by date correctly in local timezone', () => {
      const entries: TimeEntry[] = [
        {
          id: '1',
          taskName: 'Task 1',
          startTime: new Date('2024-01-15T04:30:00.000Z'), // 11:30 PM EST Jan 14
          isRunning: false,
          date: '2024-01-14', // Should be Jan 14 in local timezone
        },
        {
          id: '2',
          taskName: 'Task 2',
          startTime: new Date('2024-01-15T14:30:00.000Z'), // 9:30 AM EST Jan 15
          isRunning: false,
          date: '2024-01-15', // Should be Jan 15 in local timezone
        },
      ];

      // Filter entries for Jan 15 in local timezone
      const jan15Entries = entries.filter(entry => entry.date === '2024-01-15');
      
      expect(jan15Entries).toHaveLength(1);
      expect(jan15Entries[0].id).toBe('2');
    });
  });

  describe('Edit Dialog Time Handling', () => {
    it('should convert UTC times to datetime-local format correctly', () => {
      const utcStartTime = new Date('2024-01-15T14:30:00.000Z');
      const utcEndTime = new Date('2024-01-15T16:45:00.000Z');

      const startTimeLocal = formatDateTimeLocal(utcStartTime);
      const endTimeLocal = formatDateTimeLocal(utcEndTime);

      // Should be in local timezone for datetime-local input (Mountain Time UTC-7)
      expect(startTimeLocal).toBe('2024-01-15T07:30');
      expect(endTimeLocal).toBe('2024-01-15T09:45');
    });

    it('should convert datetime-local input back to UTC correctly', () => {
      // Simulate user input in datetime-local format (local timezone)
      const localStartTime = '2024-01-15T07:30';
      const localEndTime = '2024-01-15T09:45';

      // Convert to Date objects (this is what the edit dialog does)
      const startTime = new Date(localStartTime.replace('T', ' ') + ':00');
      const endTime = new Date(localEndTime.replace('T', ' ') + ':00');

      // These should be interpreted as local time and stored as UTC
      // In Mountain Time (UTC-7), 7:30 AM local = 2:30 PM UTC
      expect(startTime.toISOString()).toBe('2024-01-15T14:30:00.000Z');
      expect(endTime.toISOString()).toBe('2024-01-15T16:45:00.000Z');
    });
  });

  describe('Duration Calculations', () => {
    it('should calculate duration correctly regardless of timezone', () => {
      const startTime = new Date('2024-01-15T14:30:00.000Z');
      const endTime = new Date('2024-01-15T16:45:00.000Z');

      const duration = endTime.getTime() - startTime.getTime();
      const expectedDuration = 2 * 60 * 60 * 1000 + 15 * 60 * 1000; // 2h 15m

      expect(duration).toBe(expectedDuration);
    });

    it('should handle duration calculations across DST boundaries', () => {
      // Test during DST transition (spring forward)
      const startTime = new Date('2024-03-10T06:30:00.000Z'); // 1:30 AM EST
      const endTime = new Date('2024-03-10T08:30:00.000Z'); // 4:30 AM EDT (after DST)

      const duration = endTime.getTime() - startTime.getTime();
      const expectedDuration = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

      // Duration should still be 2 hours in UTC time
      expect(duration).toBe(expectedDuration);
    });
  });

  describe('System Tray Integration', () => {
    it('should format times correctly for system tray display', () => {
      const entry: TimeEntry = {
        id: 'tray-test',
        taskName: 'Tray Task',
        startTime: new Date('2024-01-15T14:30:00.000Z'),
        isRunning: true,
        date: '2024-01-15',
      };

      // System tray should show local time (Mountain Time UTC-7)
      const displayTime = formatLocalTime(entry.startTime);
      expect(displayTime).toBe('07:30');

      // Date should also be in local timezone
      const displayDate = formatLocalDate(entry.startTime);
      expect(displayDate).toBe('Jan 15, 2024');
    });
  });
});
