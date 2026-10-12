/**
 * CSV export of time entries (Reports and Time Entries): one row per finished
 * entry, earnings at the rate the time was tracked at.
 */

import { Dayjs } from 'dayjs';
import { Task } from '../types/task';
import { MANUAL_SOURCE, TimeEntry } from '../types/timer';
import { WORKLOG_IMPORT_SOURCE } from '../types/workLog';
import { entryEarnings, entryRate } from './earnings';
import { formatDateString } from './dateHelpers';

const HEADER = ['Date', 'Task', 'Start', 'End', 'Hours', 'Rate', 'Earnings', 'Source'];
// Byte-order mark: without it Excel reads UTF-8 task names as Latin-1
const BOM = '﻿';

export function sourceLabel(source?: string): string {
  if (source === WORKLOG_IMPORT_SOURCE) return 'Imported';
  if (source === MANUAL_SOURCE) return 'Manual';
  return 'Tracked';
}

/** Local "YYYY-MM-DD HH:mm", which spreadsheets read as a date-time. */
function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDateString(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * One CSV cell. Text starting with = + - @ gets a leading ' so a spreadsheet
 * shows it instead of running it as a formula; quotes, commas and line breaks
 * are quoted per RFC 4180.
 */
export function csvCell(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Finished entries as CSV, oldest first. Running timers are left out. */
export function timeEntriesToCsv(entries: TimeEntry[], tasks: Task[]): string {
  const rows = exportableEntries(entries)
    .map(entry => ({ entry, start: new Date(entry.startTime) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(({ entry, start }) => {
      const durationMs = entry.duration ?? 0;
      const end = entry.endTime ? new Date(entry.endTime) : new Date(start.getTime() + durationMs);
      return [
        entry.date || formatDateString(start),
        entry.taskName,
        localDateTime(start),
        localDateTime(end),
        (durationMs / 3_600_000).toFixed(2),
        entryRate(entry, tasks).toFixed(2),
        entryEarnings(entry, tasks).toFixed(2),
        sourceLabel(entry.source),
      ];
    });

  return BOM + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Rows a CSV export would contain (finished entries). */
export function exportableEntries(entries: TimeEntry[]): TimeEntry[] {
  return entries.filter(entry => !entry.isRunning && (entry.duration ?? 0) > 0);
}

/**
 * "taskmint-time-entries-2026-10-01-to-2026-10-31.csv": the filter's range,
 * or the entries' own first and last days when the range is open.
 */
export function csvFileName(
  entries: TimeEntry[],
  start: Dayjs | null = null,
  end: Dayjs | null = null
): string {
  const days = entries.map(entry => entry.date || formatDateString(entry.startTime)).sort();
  const from = start ? start.format('YYYY-MM-DD') : days[0];
  const to = end ? end.format('YYYY-MM-DD') : days[days.length - 1];
  if (!from || !to) return 'taskmint-time-entries.csv';
  return from === to
    ? `taskmint-time-entries-${from}.csv`
    : `taskmint-time-entries-${from}-to-${to}.csv`;
}
