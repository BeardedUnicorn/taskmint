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
      expect(matchPreset(start?.add(5, 'hour') ?? null, end, today)).toBe(value);
    }
  });

  it('is null for a custom range', () => {
    expect(matchPreset(today.subtract(3, 'day'), today, today)).toBeNull();
    expect(matchPreset(today, null, today)).toBeNull();
  });
});
