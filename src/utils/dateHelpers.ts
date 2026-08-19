/**
 * Date and Time Helper Utilities
 * 
 * This file contains utility functions for date and time manipulation,
 * formatting, and calculations using dayjs.
 */

import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';

// Extend dayjs with required plugins
dayjs.extend(localizedFormat);
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.extend(relativeTime);

/**
 * Format a date/time to local time string (HH:mm format)
 */
export function formatLocalTime(date: Date | string): string {
  return dayjs(date).local().format('HH:mm');
}

/**
 * Format a date to YYYY-MM-DD format in local timezone
 */
export function formatDateString(date: Date | string): string {
  return dayjs(date).local().format('YYYY-MM-DD');
}

/**
 * Parse a YYYY-MM-DD date string as local time. `new Date('YYYY-MM-DD')`
 * parses as UTC midnight, which shifts to the previous day for users west of
 * UTC; dayjs parses date-only strings in local time.
 */
export function parseDateStringLocal(dateStr: string): Date {
  return dayjs(dateStr).toDate();
}

/**
 * Format a date to local date string (MMM DD, YYYY format)
 */
export function formatLocalDate(date: Date | string): string {
  return dayjs(date).local().format('MMM DD, YYYY');
}

/**
 * Format a date to local date string with day of week (dddd format)
 */
export function formatLocalDateWithDay(date: Date | string): string {
  return dayjs(date).local().format('dddd');
}

/**
 * Format a date to full local date and time string
 */
export function formatLocalDateTime(date: Date | string): string {
  return dayjs(date).local().format('MMM DD, YYYY [at] h:mm A');
}

/**
 * Format a date for display with relative time logic (Today, Yesterday, etc.)
 */
export function formatRelativeDate(date: Date | string): string {
  const dateObj = dayjs(date).local();
  const now = dayjs().local();
  const diffDays = now.diff(dateObj, 'day');
  
  if (diffDays === 0) {
    return `Today at ${dateObj.format('h:mm A')}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${dateObj.format('h:mm A')}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return dateObj.format('MMM DD, YYYY');
  }
}

/**
 * Format a date for table display (uses browser's locale)
 */
export function formatLocalDateForTable(date: Date | string): string {
  return dayjs(date).local().toDate().toLocaleDateString();
}

/**
 * Format a date and time for detailed display (uses browser's locale)
 */
export function formatLocalDateTimeForDisplay(date: Date | string): string {
  return dayjs(date).local().toDate().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get the start of the current day
 */
export function getStartOfDay(date?: Date | string): Date {
  return dayjs(date).startOf('day').toDate();
}

/**
 * Get the end of the current day
 */
export function getEndOfDay(date?: Date | string): Date {
  return dayjs(date).endOf('day').toDate();
}

/**
 * Get the start of the current week
 */
export function getStartOfWeek(date?: Date | string): Date {
  return dayjs(date).startOf('week').toDate();
}

/**
 * Get the end of the current week
 */
export function getEndOfWeek(date?: Date | string): Date {
  return dayjs(date).endOf('week').toDate();
}

/**
 * Get the start of the current month
 */
export function getStartOfMonth(date?: Date | string): Date {
  return dayjs(date).startOf('month').toDate();
}

/**
 * Get the end of the current month
 */
export function getEndOfMonth(date?: Date | string): Date {
  return dayjs(date).endOf('month').toDate();
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  return dayjs(date).isSame(dayjs(), 'day');
}

/**
 * Check if a date is within the last week
 */
export function isWithinLastWeek(date: Date | string): boolean {
  const weekAgo = dayjs().subtract(1, 'week');
  return dayjs(date).isAfter(weekAgo);
}

/**
 * Check if a date is within the last month
 */
export function isWithinLastMonth(date: Date | string): boolean {
  const monthAgo = dayjs().subtract(1, 'month');
  return dayjs(date).isAfter(monthAgo);
}

/**
 * Check if a date is within the last quarter
 */
export function isWithinLastQuarter(date: Date | string): boolean {
  const quarterAgo = dayjs().subtract(3, 'month');
  return dayjs(date).isAfter(quarterAgo);
}

/**
 * Get a human-readable relative time string
 */
export function getRelativeTime(date: Date | string): string {
  return dayjs(date).fromNow();
}

/**
 * Calculate the difference between two dates in milliseconds
 */
export function getTimeDifference(startDate: Date | string, endDate: Date | string): number {
  return dayjs(endDate).diff(dayjs(startDate));
}

/**
 * Convert time entry date strings back to Date objects
 * This is needed when loading time entries from localStorage where dates are serialized as strings
 */
export function convertTimeEntryDates<T extends { startTime: any; endTime?: any }>(entry: T): T {
  return {
    ...entry,
    startTime: entry.startTime instanceof Date ? entry.startTime : new Date(entry.startTime),
    endTime: entry.endTime ? (entry.endTime instanceof Date ? entry.endTime : new Date(entry.endTime)) : undefined,
  };
}

/**
 * Convert an array of time entries, ensuring all date fields are proper Date objects
 */
export function convertTimeEntriesDates<T extends { startTime: any; endTime?: any }>(entries: T[]): T[] {
  return entries.map(convertTimeEntryDates);
}
