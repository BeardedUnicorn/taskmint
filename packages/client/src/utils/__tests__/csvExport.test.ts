import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { csvCell, csvFileName, timeEntriesToCsv } from '../csvExport';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';

const HOUR = 3_600_000;
const tasks: Task[] = [
  { id: 'task-1', name: 'Annotation', hourlyRate: 60, createdAt: '', updatedAt: '' },
];

const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'i-1',
  taskId: 'task-1',
  taskName: 'Annotation',
  startTime: new Date(2026, 9, 10, 9, 5),
  endTime: new Date(2026, 9, 10, 10, 35),
  duration: 1.5 * HOUR,
  isRunning: false,
  date: '2026-10-10',
  hourlyRate: 40,
  ...overrides,
});

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('timeEntriesToCsv', () => {
  it('writes one row per finished entry, oldest first, at the rate it was tracked at', () => {
    const csv = timeEntriesToCsv(
      [
        entry({ id: 'later', startTime: new Date(2026, 9, 11, 14, 0), endTime: new Date(2026, 9, 11, 14, 45), duration: 0.75 * HOUR, date: '2026-10-11', source: 'manual' }),
        entry(),
        entry({ id: 'imported', source: 'worklog-import', startTime: new Date(2026, 9, 9, 8, 0), endTime: new Date(2026, 9, 9, 9, 0), duration: HOUR, date: '2026-10-09' }),
      ],
      tasks
    );

    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines(csv)).toEqual([
      'Date,Task,Start,End,Hours,Rate,Earnings,Source',
      '2026-10-09,Annotation,2026-10-09 08:00,2026-10-09 09:00,1.00,40.00,40.00,Imported',
      '2026-10-10,Annotation,2026-10-10 09:05,2026-10-10 10:35,1.50,40.00,60.00,Tracked',
      '2026-10-11,Annotation,2026-10-11 14:00,2026-10-11 14:45,0.75,40.00,30.00,Manual',
    ]);
  });

  it("falls back to the task's rate when the entry has none", () => {
    const [, row] = lines(timeEntriesToCsv([entry({ hourlyRate: null })], tasks));
    expect(row.split(',').slice(5, 7)).toEqual(['60.00', '90.00']);
  });

  it('leaves out running timers', () => {
    const csv = timeEntriesToCsv([entry({ isRunning: true, duration: undefined, endTime: undefined })], tasks);
    expect(lines(csv)).toHaveLength(1);
  });

  it('quotes task names that need it', () => {
    const [, row] = lines(timeEntriesToCsv([entry({ taskName: 'Review, "gold" set' })], tasks));
    expect(row).toContain(',"Review, ""gold"" set",');
  });
});

describe('csvCell', () => {
  it("keeps a spreadsheet from running text as a formula", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell('Plain')).toBe('Plain');
  });

  it('quotes line breaks', () => {
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
});

describe('csvFileName', () => {
  it("names the filter's range, or the entries' own days when it's open", () => {
    const entries = [entry({ date: '2026-10-03' }), entry({ date: '2026-10-09' })];
    expect(csvFileName(entries, dayjs('2026-10-01'), dayjs('2026-10-31'))).toBe(
      'taskmint-time-entries-2026-10-01-to-2026-10-31.csv'
    );
    expect(csvFileName(entries)).toBe('taskmint-time-entries-2026-10-03-to-2026-10-09.csv');
    expect(csvFileName([entry()])).toBe('taskmint-time-entries-2026-10-10.csv');
    expect(csvFileName([])).toBe('taskmint-time-entries.csv');
  });
});
