/**
 * Chart Data Helpers
 * 
 * Utility functions for processing time entries data into formats suitable for charts
 */

import dayjs from 'dayjs';
import { TimeEntry } from '../types/timer';
import { Task } from '../types/task';

export interface TaskTimeData {
  taskName: string;
  totalTime: number; // in milliseconds
  totalEarnings: number;
  entryCount: number;
  color?: string;
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
 * Get task by ID or name from tasks array
 */
function getTaskInfo(entry: TimeEntry, tasks: Task[]): Task | undefined {
  let task = tasks.find(t => t.id === entry.taskId);
  if (!task) {
    task = tasks.find(t => t.name === entry.taskName);
  }
  return task;
}

/**
 * Calculate earnings for a time entry
 */
function calculateEarnings(entry: TimeEntry, tasks: Task[]): number {
  if (!entry.duration) return 0;
  
  const task = getTaskInfo(entry, tasks);
  if (!task?.hourlyRate) return 0;
  
  const hours = entry.duration / (1000 * 60 * 60);
  return hours * task.hourlyRate;
}

/**
 * Aggregate time entries by task for bar chart
 */
export function aggregateByTask(entries: TimeEntry[], tasks: Task[]): TaskTimeData[] {
  const taskMap = new Map<string, TaskTimeData>();
  
  entries.forEach(entry => {
    if (!entry.duration) return;
    
    const taskName = entry.taskName;
    const earnings = calculateEarnings(entry, tasks);
    
    if (taskMap.has(taskName)) {
      const existing = taskMap.get(taskName)!;
      existing.totalTime += entry.duration;
      existing.totalEarnings += earnings;
      existing.entryCount += 1;
    } else {
      taskMap.set(taskName, {
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
 * Aggregate time entries by week for line chart
 */
export function aggregateByWeek(entries: TimeEntry[], tasks: Task[]): WeeklyData[] {
  const weekMap = new Map<string, WeeklyData>();
  
  entries.forEach(entry => {
    if (!entry.duration) return;
    
    const weekStart = dayjs(entry.startTime).startOf('week');
    const weekKey = weekStart.format('YYYY-MM-DD');
    const weekLabel = `${weekStart.format('MMM DD')} - ${weekStart.add(6, 'day').format('MMM DD')}`;
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
  
  return Array.from(weekMap.values()).sort((a, b) => {
    const aDate = dayjs(a.week.split(' - ')[0]);
    const bDate = dayjs(b.week.split(' - ')[0]);
    return aDate.isBefore(bDate) ? -1 : 1;
  });
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
  
  return Array.from(monthMap.values()).sort((a, b) => {
    const aDate = dayjs(a.month, 'MMM YYYY');
    const bDate = dayjs(b.month, 'MMM YYYY');
    return aDate.isBefore(bDate) ? -1 : 1;
  });
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
 * Generate colors for chart data
 */
export function generateChartColors(count: number): string[] {
  const colors = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1',
    '#d084d0', '#ffb347', '#87ceeb', '#dda0dd', '#98fb98',
    '#f0e68c', '#ff6347', '#40e0d0', '#ee82ee', '#90ee90'
  ];
  
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  
  return result;
}

/**
 * Get chart theme colors based on Material-UI theme mode
 */
export function getChartTheme(isDarkMode: boolean) {
  return {
    backgroundColor: isDarkMode ? '#121212' : '#ffffff',
    textColor: isDarkMode ? '#ffffff' : '#000000',
    gridColor: isDarkMode ? '#333333' : '#e0e0e0',
    tooltipBackground: isDarkMode ? '#333333' : '#ffffff',
    tooltipBorder: isDarkMode ? '#555555' : '#cccccc',
  };
}

/**
 * Prepare data for pie chart showing task distribution
 */
export function prepareTaskDistributionData(entries: TimeEntry[]): Array<{
  name: string;
  value: number;
  percentage: number;
}> {
  const taskData = aggregateByTask(entries, []);
  const totalTime = taskData.reduce((sum, task) => sum + task.totalTime, 0);
  
  return taskData.map(task => ({
    name: task.taskName,
    value: millisecondsToHours(task.totalTime),
    percentage: totalTime > 0 ? (task.totalTime / totalTime) * 100 : 0,
  }));
}
