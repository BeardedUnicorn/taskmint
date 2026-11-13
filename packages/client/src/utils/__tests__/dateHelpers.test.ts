import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatLocalDateWithDay, formatRelativeDate, isToday } from '../dateHelpers';

describe('relative dates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 15, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says today, yesterday, a few days ago, or the date', () => {
    expect(formatRelativeDate(new Date(2026, 9, 27, 9, 30))).toBe('Today at 9:30 AM');
    expect(formatRelativeDate(new Date(2026, 9, 26, 14, 5))).toBe('Yesterday at 2:05 PM');
    expect(formatRelativeDate(new Date(2026, 9, 23, 12, 0))).toBe('4 days ago');
    expect(formatRelativeDate(new Date(2026, 8, 1, 12, 0))).toBe('Sep 1, 2026');
  });

  it('knows today, and the day of the week', () => {
    expect(isToday(new Date(2026, 9, 27, 1, 0))).toBe(true);
    expect(isToday('2026-10-26T12:00:00')).toBe(false);
    expect(formatLocalDateWithDay(new Date(2026, 9, 27, 12, 0))).toBe('Tuesday');
  });
});
