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
      
      // When displayed in the user's local timezone
      const localTime = formatLocalTime(utcDate);

      // Compute expected value based on the current environment timezone
      const expected = dayjs.utc(utcDate).tz(currentTimezone).format('HH:mm');
      expect(localTime).toBe(expected);
    });

    it('should handle date strings correctly', () => {
      const utcDate = new Date('2024-01-15T14:30:00.000Z');

      // Date should be formatted in local timezone
      const dateString = formatDateString(utcDate);

      const expected = dayjs
        .utc(utcDate)
        .tz(currentTimezone)
        .format('YYYY-MM-DD');
      expect(dateString).toBe(expected);
    });

    it('should handle edge cases around midnight', () => {
      // UTC date that crosses midnight in local timezone
      const utcDate = new Date('2024-01-15T04:30:00.000Z'); // 4:30 AM UTC

      // In local timezone this may fall on the previous day
      const localTime = formatLocalTime(utcDate);
      const localDate = formatDateString(utcDate);

      const expectedTime = dayjs
        .utc(utcDate)
        .tz(currentTimezone)
        .format('HH:mm');
      const expectedDate = dayjs
        .utc(utcDate)
        .tz(currentTimezone)
        .format('YYYY-MM-DD');

      expect(localTime).toBe(expectedTime);
      expect(localDate).toBe(expectedDate); // Previous day in some timezones
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
      
      // Verify local display matches current timezone
      const expectedStart = dayjs
        .utc(deserializedEntry.startTime)
        .tz(currentTimezone)
        .format('HH:mm');
      const expectedEnd = dayjs
        .utc(deserializedEntry.endTime!)
        .tz(currentTimezone)
        .format('HH:mm');
      expect(formatLocalTime(deserializedEntry.startTime)).toBe(expectedStart);
      expect(formatLocalTime(deserializedEntry.endTime!)).toBe(expectedEnd);
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
      const expected = dayjs
        .utc(deserializedEntry.startTime)
        .tz(currentTimezone)
        .format('HH:mm');
      expect(formatLocalTime(deserializedEntry.startTime)).toBe(expected);
    });
  });

  describe('Date Calculations in Local Timezone', () => {
    it('should calculate start of day in local timezone', () => {
      const date = new Date('2024-01-15T14:30:00.000Z'); // 2:30 PM UTC, 7:30 AM MST

      const startOfDay = getStartOfDay(date);

      // Start of day should be midnight in local timezone
      const expected = dayjs
        .utc(date)
        .tz(currentTimezone)
        .startOf('day')
        .utc()
        .toISOString();
      expect(startOfDay.toISOString()).toBe(expected);
    });

    it('should calculate end of day in local timezone', () => {
      const date = new Date('2024-01-15T14:30:00.000Z'); // 2:30 PM UTC, 7:30 AM MST

      const endOfDay = getEndOfDay(date);

      // End of day should be 23:59:59.999 in local timezone
      const expected = dayjs
        .utc(date)
        .tz(currentTimezone)
        .endOf('day')
        .utc()
        .toISOString();
      expect(endOfDay.toISOString()).toBe(expected);
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

      // System tray should show local time
      const displayTime = formatLocalTime(entry.startTime);
      const expectedTime = dayjs
        .utc(entry.startTime)
        .tz(currentTimezone)
        .format('HH:mm');
      expect(displayTime).toBe(expectedTime);

      // Date should also be in local timezone
      const displayDate = formatLocalDate(entry.startTime);
      const expectedDate = dayjs
        .utc(entry.startTime)
        .tz(currentTimezone)
        .format('MMM DD, YYYY');
      expect(displayDate).toBe(expectedDate);
    });
  });
});
