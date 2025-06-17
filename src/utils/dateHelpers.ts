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
 * Format a date to YYYY-MM-DD format
 */
export function formatDateString(date: Date | string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/**
 * Format a date/time for datetime-local input
 */
export function formatDateTimeLocal(date: Date | string): string {
  return dayjs(date).format('YYYY-MM-DDTHH:mm');
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
