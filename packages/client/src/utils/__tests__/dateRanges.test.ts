import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { DATE_RANGE_PRESETS, matchPreset, presetRange } from '../dateRanges';

// Wednesday 15 Oct 2026, mid-afternoon
const today = dayjs(new Date(2026, 9, 15, 15, 30));
const fmt = (preset: Parameters<typeof presetRange>[0], at = today) => {
  const { start, end } = presetRange(preset, at);
  return [start?.format('YYYY-MM-DD') ?? null, end?.format('YYYY-MM-DD') ?? null];
};

describe('presetRange', () => {
  it('covers whole days, start and end inclusive', () => {
    expect(fmt('today')).toEqual(['2026-10-15', '2026-10-15']);
    expect(fmt('yesterday')).toEqual(['2026-10-14', '2026-10-14']);
    expect(fmt('last7')).toEqual(['2026-10-09', '2026-10-15']);
    expect(fmt('last30')).toEqual(['2026-09-16', '2026-10-15']);
    expect(presetRange('today', today).start!.hour()).toBe(0);
  });

  it('runs weeks Sunday to Saturday', () => {
    expect(fmt('thisWeek')).toEqual(['2026-10-11', '2026-10-17']);
    expect(fmt('lastWeek')).toEqual(['2026-10-04', '2026-10-10']);
    // On a Sunday, "this week" starts that day
    expect(fmt('thisWeek', dayjs(new Date(2026, 9, 11, 8)))).toEqual(['2026-10-11', '2026-10-17']);
  });

  it('handles month edges', () => {
    expect(fmt('thisMonth')).toEqual(['2026-10-01', '2026-10-31']);
    expect(fmt('lastMonth')).toEqual(['2026-09-01', '2026-09-30']);
    // Last month from 31 March is all of February
    expect(fmt('lastMonth', dayjs(new Date(2026, 2, 31)))).toEqual(['2026-02-01', '2026-02-28']);
    // Last month from January is December of the year before
    expect(fmt('lastMonth', dayjs(new Date(2026, 0, 5)))).toEqual(['2025-12-01', '2025-12-31']);
  });

  it('leaves All time open at both ends', () => {
    expect(fmt('all')).toEqual([null, null]);
  });
});

describe('matchPreset', () => {
  it('finds the preset a range is, ignoring the time of day', () => {
    for (const { value } of DATE_RANGE_PRESETS) {
      const { start, end } = presetRange(value, today);
      expect(matchPreset(start?.add(5, 'hour') ?? null, end, null, today)).toBe(value);
    }
  });

  it('is null for a custom range', () => {
    expect(matchPreset(today.subtract(3, 'day'), today, null, today)).toBeNull();
    expect(matchPreset(today, null, 'last7', today)).toBeNull();
  });

  it('names the preset chosen when another covers the same days', () => {
    // Saturday 7 Nov 2026: this week (Sun 1 – Sat 7) is the last 7 days
    const saturday = dayjs(new Date(2026, 10, 7, 15));
    const week = presetRange('last7', saturday);
    expect(presetRange('thisWeek', saturday)).toEqual(week);
    expect(matchPreset(week.start, week.end, 'last7', saturday)).toBe('last7');
    expect(matchPreset(week.start, week.end, 'thisWeek', saturday)).toBe('thisWeek');
    // Nothing chosen, or a choice the dates no longer fit: the first listed
    expect(matchPreset(week.start, week.end, null, saturday)).toBe('thisWeek');
    expect(matchPreset(week.start, week.end, 'today', saturday)).toBe('thisWeek');

    // 30 Sept 2026: this month is the last 30 days
    const monthEnd = dayjs(new Date(2026, 8, 30, 9));
    const month = presetRange('last30', monthEnd);
    expect(presetRange('thisMonth', monthEnd)).toEqual(month);
    expect(matchPreset(month.start, month.end, 'last30', monthEnd)).toBe('last30');
    expect(matchPreset(month.start, month.end, null, monthEnd)).toBe('thisMonth');
  });
});
