/**
 * Date and Time Helper Utilities
 * 
 * This file contains utility functions for date and time manipulation,
 * formatting, and calculations using dayjs.
 */

import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formattingLocale } from './locale';

// Extend dayjs with required plugins. Not `timezone`: nothing here needs
// named zones, and when dayjs.tz exists react-big-calendar's localizer
// switches to tz-mode date math that adds 24h per "day" across a DST change
// (duplicating Nov 1 in US zones). See utils/calendarLocalizer.ts.
dayjs.extend(localizedFormat);
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
 * Format a date and time for detailed display (uses browser's locale)
 */
export function formatLocalDateTimeForDisplay(date: Date | string): string {
  return dayjs(date).local().toDate().toLocaleDateString(formattingLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  return dayjs(date).isSame(dayjs(), 'day');
}
