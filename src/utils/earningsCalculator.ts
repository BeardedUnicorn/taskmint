/**
 * Earnings Calculator Utility
 * 
 * Centralized utility for calculating earnings from time entries and tasks
 * Provides consistent earnings calculation logic across the application
 */

import { TimeEntry } from '../types/timer';
import { Task } from '../types/task';
import { formatDateString } from './dateHelpers';

/**
 * Calculate total earnings for a specific date
 * @param date - Date in YYYY-MM-DD format
 * @param timeEntries - Array of time entries
 * @param tasks - Array of tasks with hourly rates
 * @returns Total earnings for the specified date
 */
export function calculateTotalEarningsForDate(
  date: string,
  timeEntries: TimeEntry[],
  tasks: Task[]
): number {
  // Filter entries for the specific date
  const dateEntries = timeEntries.filter(entry => entry.date === date);
  
  return dateEntries.reduce((total, entry) => {
    const earnings = calculateEntryEarnings(entry, tasks);
    return total + earnings;
  }, 0);
}

/**
 * Calculate earnings for a single time entry
 * @param entry - Time entry to calculate earnings for
 * @param tasks - Array of tasks with hourly rates
 * @returns Earnings for the time entry
 */
export function calculateEntryEarnings(entry: TimeEntry, tasks: Task[]): number {
  // Only calculate earnings for completed entries with duration
  if (!entry.duration || entry.isRunning) {
    return 0;
  }

  // Find the associated task
  const task = findTaskForEntry(entry, tasks);
  
  // No earnings if task not found or no hourly rate
  if (!task?.hourlyRate || task.hourlyRate <= 0) {
    return 0;
  }

  // Convert duration from milliseconds to hours and calculate earnings
  const hours = entry.duration / (1000 * 60 * 60);
  return hours * task.hourlyRate;
}

/**
 * Find the task associated with a time entry
 * @param entry - Time entry to find task for
 * @param tasks - Array of tasks
 * @returns Associated task or undefined
 */
export function findTaskForEntry(entry: TimeEntry, tasks: Task[]): Task | undefined {
  // Try to find by task ID first (more reliable)
  if (entry.taskId) {
    const taskById = tasks.find(task => task.id === entry.taskId);
    if (taskById) {
      return taskById;
    }
  }

  // Fall back to finding by task name
  return tasks.find(task => task.name === entry.taskName);
}

/**
 * Calculate total earnings for a date range
 * @param startDate - Start date in YYYY-MM-DD format (inclusive)
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @param timeEntries - Array of time entries
 * @param tasks - Array of tasks with hourly rates
 * @returns Total earnings for the date range
 */
export function calculateTotalEarningsForDateRange(
  startDate: string,
  endDate: string,
  timeEntries: TimeEntry[],
  tasks: Task[]
): number {
  // Filter entries within the date range
  const rangeEntries = timeEntries.filter(entry => 
    entry.date >= startDate && entry.date <= endDate
  );
  
  return rangeEntries.reduce((total, entry) => {
    const earnings = calculateEntryEarnings(entry, tasks);
    return total + earnings;
  }, 0);
}

/**
 * Calculate earnings breakdown by task for a specific date
 * @param date - Date in YYYY-MM-DD format
 * @param timeEntries - Array of time entries
 * @param tasks - Array of tasks with hourly rates
 * @returns Object mapping task names to their earnings
 */
export function calculateEarningsBreakdownForDate(
  date: string,
  timeEntries: TimeEntry[],
  tasks: Task[]
): Record<string, number> {
  const dateEntries = timeEntries.filter(entry => entry.date === date);
  const breakdown: Record<string, number> = {};
  
  dateEntries.forEach(entry => {
    const earnings = calculateEntryEarnings(entry, tasks);
    if (earnings > 0) {
      const taskName = entry.taskName;
      breakdown[taskName] = (breakdown[taskName] || 0) + earnings;
    }
  });
  
  return breakdown;
}

/**
 * Calculate earnings statistics for a date range
 * @param startDate - Start date in YYYY-MM-DD format (inclusive)
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @param timeEntries - Array of time entries
 * @param tasks - Array of tasks with hourly rates
 * @returns Earnings statistics object
 */
export interface EarningsStats {
  totalEarnings: number;
  averageEarningsPerDay: number;
  highestDayEarnings: number;
  lowestDayEarnings: number;
  daysWithEarnings: number;
  totalDays: number;
  earningsByDate: Record<string, number>;
}

export function calculateEarningsStats(
  startDate: string,
  endDate: string,
  timeEntries: TimeEntry[],
  tasks: Task[]
): EarningsStats {
  // Generate all dates in the range
  const dates = generateDateRange(startDate, endDate);
  const earningsByDate: Record<string, number> = {};
  
  // Calculate earnings for each date
  dates.forEach(date => {
    earningsByDate[date] = calculateTotalEarningsForDate(date, timeEntries, tasks);
  });
  
  const earningsValues = Object.values(earningsByDate);
  const totalEarnings = earningsValues.reduce((sum, earnings) => sum + earnings, 0);
  const daysWithEarnings = earningsValues.filter(earnings => earnings > 0).length;
  
  const earningsWithPositiveValues = earningsValues.filter(e => e > 0);

  return {
    totalEarnings,
    averageEarningsPerDay: totalEarnings / dates.length,
    highestDayEarnings: Math.max(...earningsValues, 0),
    lowestDayEarnings: earningsWithPositiveValues.length > 0 ? Math.min(...earningsWithPositiveValues) : 0,
    daysWithEarnings,
    totalDays: dates.length,
    earningsByDate,
  };
}

/**
 * Generate array of dates between start and end date (inclusive)
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Array of date strings in YYYY-MM-DD format
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Get today's date in YYYY-MM-DD format, in the user's LOCAL timezone.
 * Entry/session dates are local day strings, so the boundary here must be
 * local too — the old toISOString() version used a UTC boundary, flipping
 * "today" hours early for users west of UTC (late afternoon in the US).
 * @returns Today's date string
 */
export function getTodayDateString(): string {
  return formatDateString(new Date());
}
