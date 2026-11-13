/**
 * Chart Data Helpers
 *
 * Utility functions for processing time entries data into formats suitable for charts
 */

import dayjs from 'dayjs';
import { TimeEntry } from '../types/timer';
import { Task } from '../types/task';
import { entryEarnings, findTaskFor } from './earnings';

export interface TaskTimeData {
  taskName: string;
  totalTime: number; // in milliseconds
  totalEarnings: number;
  entryCount: number;
}

export interface DailyData {
  date: string;
  totalTime: number; // in milliseconds
  totalEarnings: number;
  entryCount: number;
}

export interface WeeklyData {
  week: string;
  totalTime: number; // in milliseconds
  totalEarnings: number;
  entryCount: number;
}

export interface MonthlyData {
  month: string;
  totalTime: number; // in milliseconds
  totalEarnings: number;
  entryCount: number;
}

/**
 * Earnings for a time entry, at its session's rate (shared with every page)
 */
const calculateEarnings = entryEarnings;

/**
 * Aggregate time entries by task for bar chart. Entries group by task id (by
 * name only for old entries without one) and show the task's current name,
 * so a renamed task stays one bar.
 */
export function aggregateByTask(entries: TimeEntry[], tasks: Task[]): TaskTimeData[] {
  const taskMap = new Map<string, TaskTimeData>();

  entries.forEach(entry => {
    if (!entry.duration) return;

    const task = findTaskFor(entry, tasks);
    const key = task?.id ?? entry.taskId ?? `name:${entry.taskName}`;
    const taskName = task?.name ?? entry.taskName;
    const earnings = calculateEarnings(entry, tasks);

    if (taskMap.has(key)) {
      const existing = taskMap.get(key)!;
      existing.totalTime += entry.duration;
      existing.totalEarnings += earnings;
      existing.entryCount += 1;
    } else {
      taskMap.set(key, {
        taskName,
        totalTime: entry.duration,
        totalEarnings: earnings,
        entryCount: 1,
      });
    }
  });

  return Array.from(taskMap.values()).sort((a, b) => b.totalTime - a.totalTime);
}

/**
 * Aggregate time entries by day for line chart
 */
export function aggregateByDay(entries: TimeEntry[], tasks: Task[]): DailyData[] {
  const dayMap = new Map<string, DailyData>();

  entries.forEach(entry => {
    if (!entry.duration) return;

    const date = entry.date || dayjs(entry.startTime).format('YYYY-MM-DD');
    const earnings = calculateEarnings(entry, tasks);

    if (dayMap.has(date)) {
      const existing = dayMap.get(date)!;
      existing.totalTime += entry.duration;
      existing.totalEarnings += earnings;
      existing.entryCount += 1;
    } else {
      dayMap.set(date, {
        date,
        totalTime: entry.duration,
        totalEarnings: earnings,
        entryCount: 1,
      });
    }
  });

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The map's values, oldest first: its keys are ISO days or months
 * ("2026-01-04", "2026-01"), which sort as text. (The labels have no year,
 * so they can't be sorted.)
 */
function byKey<T>(map: Map<string, T>): T[] {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}

/**
 * Aggregate time entries by week for line chart
 */
export function aggregateByWeek(entries: TimeEntry[], tasks: Task[]): WeeklyData[] {
  const weekMap = new Map<string, WeeklyData>();

  entries.forEach(entry => {
    if (!entry.duration) return;

    const weekStart = dayjs(entry.startTime).startOf('week');
    const weekKey = weekStart.format('YYYY-MM-DD');
    const weekLabel = `${weekStart.format('MMM D')} - ${weekStart.add(6, 'day').format('MMM D')}`;
    const earnings = calculateEarnings(entry, tasks);

    if (weekMap.has(weekKey)) {
      const existing = weekMap.get(weekKey)!;
      existing.totalTime += entry.duration;
      existing.totalEarnings += earnings;
      existing.entryCount += 1;
    } else {
      weekMap.set(weekKey, {
        week: weekLabel,
        totalTime: entry.duration,
        totalEarnings: earnings,
        entryCount: 1,
      });
    }
  });

  return byKey(weekMap);
}

/**
 * Aggregate time entries by month for line chart
 */
export function aggregateByMonth(entries: TimeEntry[], tasks: Task[]): MonthlyData[] {
  const monthMap = new Map<string, MonthlyData>();

  entries.forEach(entry => {
    if (!entry.duration) return;

    const month = dayjs(entry.startTime).format('YYYY-MM');
    const monthLabel = dayjs(entry.startTime).format('MMM YYYY');
    const earnings = calculateEarnings(entry, tasks);

    if (monthMap.has(month)) {
      const existing = monthMap.get(month)!;
      existing.totalTime += entry.duration;
      existing.totalEarnings += earnings;
      existing.entryCount += 1;
    } else {
      monthMap.set(month, {
        month: monthLabel,
        totalTime: entry.duration,
        totalEarnings: earnings,
        entryCount: 1,
      });
    }
  });

  return byKey(monthMap);
}

/**
 * Convert milliseconds to hours for chart display
 */
export function millisecondsToHours(ms: number): number {
  return Number((ms / (1000 * 60 * 60)).toFixed(2));
}

/**
 * Format time for chart tooltips
 */
export function formatTimeForChart(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

/**
 * Prepare data for pie chart showing task distribution
 */
export function prepareTaskDistributionData(
  entries: TimeEntry[],
  tasks: Task[] = []
): Array<{
  name: string;
  value: number;
  percentage: number;
}> {
  const taskData = aggregateByTask(entries, tasks);
  const totalTime = taskData.reduce((sum, task) => sum + task.totalTime, 0);

  // Every task listed has time (aggregateByTask skips untimed entries), so the total isn't 0
  return taskData.map(task => ({
    name: task.taskName,
    value: millisecondsToHours(task.totalTime),
    percentage: (task.totalTime / totalTime) * 100,
  }));
}
