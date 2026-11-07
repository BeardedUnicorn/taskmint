/**
 * Quick date ranges for History ("This month", "Last 7 days", …). A range
 * is whole local days, start and end inclusive; null means open-ended. Weeks
 * start on Sunday, as on the Calendar.
 */

import dayjs, { Dayjs } from 'dayjs';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'last30'
  | 'all';

export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export interface DateRange {
  start: Dayjs | null;
  end: Dayjs | null;
}

export function isDateRangePreset(value: unknown): value is DateRangePreset {
  return DATE_RANGE_PRESETS.some(preset => preset.value === value);
}

/** The days a preset covers, as of `today`. */
export function presetRange(preset: DateRangePreset, today: Dayjs = dayjs()): DateRange {
  const day = today.startOf('day');
  switch (preset) {
    case 'today':
      return { start: day, end: day };
    case 'yesterday': {
      const yesterday = day.subtract(1, 'day');
      return { start: yesterday, end: yesterday };
    }
    case 'thisWeek': {
      const start = day.startOf('week');
      return { start, end: start.add(6, 'day') };
    }
    case 'lastWeek': {
      const start = day.startOf('week').subtract(1, 'week');
      return { start, end: start.add(6, 'day') };
    }
    case 'last7':
      return { start: day.subtract(6, 'day'), end: day };
    case 'thisMonth':
      return { start: day.startOf('month'), end: day.endOf('month').startOf('day') };
    case 'lastMonth': {
      const start = day.subtract(1, 'month').startOf('month');
      return { start, end: start.endOf('month').startOf('day') };
    }
    case 'last30':
      return { start: day.subtract(29, 'day'), end: day };
    case 'all':
      return { start: null, end: null };
  }
}

const sameDay = (a: Dayjs | null, b: Dayjs | null) =>
  a === null || b === null ? a === b : a.isSame(b, 'day');

/**
 * The preset a range is exactly, or null for a custom range. Two presets can
 * cover the same days: on a Saturday "This week" is the last 7 days, and on
 * the 30th of a 30-day month "This month" is the last 30. Then `preferred`
 * (the one chosen) wins, else the first in DATE_RANGE_PRESETS.
 */
export function matchPreset(
  start: Dayjs | null,
  end: Dayjs | null,
  preferred: DateRangePreset | null = null,
  today: Dayjs = dayjs()
): DateRangePreset | null {
  const covers = (preset: DateRangePreset) => {
    const range = presetRange(preset, today);
    return sameDay(range.start, start) && sameDay(range.end, end);
  };
  if (preferred && covers(preferred)) return preferred;
  return DATE_RANGE_PRESETS.find(({ value }) => covers(value))?.value ?? null;
}
