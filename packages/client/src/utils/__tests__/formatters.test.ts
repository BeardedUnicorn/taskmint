/**
 * Tests for formatting utilities
 */

import {
  formatTime,
  formatDuration,
  formatDurationCompact,
  formatCountdown,
  formatCurrency,
  formatMultilineText,
  createTextPreview,
} from '../formatters';

describe('formatTime', () => {
  it('should format milliseconds to HH:MM:SS format', () => {
    expect(formatTime(0)).toBe('00:00:00');
    expect(formatTime(1000)).toBe('00:00:01');
    expect(formatTime(60000)).toBe('00:01:00');
    expect(formatTime(3661000)).toBe('01:01:01');
  });

  it('should handle invalid input values', () => {
    expect(formatTime(NaN)).toBe('00:00:00');
    expect(formatTime(-1000)).toBe('00:00:00');
    expect(formatTime(undefined as any)).toBe('00:00:00');
    expect(formatTime(null as any)).toBe('00:00:00');
    expect(formatTime('invalid' as any)).toBe('00:00:00');
  });
});

describe('formatDurationCompact', () => {
  it('drops the hours under an hour', () => {
    expect(formatDurationCompact(23 * 60_000)).toBe('23m');
    expect(formatDurationCompact(0)).toBe('0m');
  });

  it('shows hours and minutes from an hour up', () => {
    expect(formatDurationCompact(65 * 60_000)).toBe('1h 5m');
    expect(formatDurationCompact(3 * 3_600_000)).toBe('3h 0m');
  });
});

describe('formatCountdown', () => {
  it('rounds up to the minute and never goes below zero', () => {
    expect(formatCountdown(30_000)).toBe('1m');
    expect(formatCountdown(-5_000)).toBe('0m');
    expect(formatCountdown(12 * 60_000)).toBe('12m');
  });

  it('shows hours and minutes, then days and hours', () => {
    expect(formatCountdown(5 * 3_600_000 + 12 * 60_000)).toBe('5h 12m');
    expect(formatCountdown(71 * 3_600_000)).toBe('2d 23h');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds to human-readable format', () => {
    expect(formatDuration(0)).toBe('0h 0m');
    expect(formatDuration(60000)).toBe('0h 1m');
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(3661000)).toBe('1h 1m');
  });
});

describe('formatCurrency', () => {
  it('reads amounts given as text, and shows ones it cannot read as zero', () => {
    expect(formatCurrency('$1,234.50')).toBe(formatCurrency(1234.5));
    expect(formatCurrency('n/a')).toBe(formatCurrency(0));
  });

  it('falls back to dollars for a code that is not a currency', () => {
    expect(formatCurrency(5, 'not-a-currency')).toBe(formatCurrency(5, 'USD'));
  });
});

describe('formatMultilineText', () => {
  it('normalizes line breaks and shortens long text', () => {
    expect(formatMultilineText('a\r\nb\rc')).toBe('a\nb\nc');
    expect(formatMultilineText('abcdef', 3)).toBe('abc...');
    expect(formatMultilineText('abc', 3)).toBe('abc');
  });

  it('is empty for no text', () => {
    expect(formatMultilineText('')).toBe('');
    expect(formatMultilineText(undefined as unknown as string)).toBe('');
  });
});

describe('createTextPreview', () => {
  it('puts the lines on one line, and shortens a long preview', () => {
    expect(createTextPreview('first\n\nsecond   line')).toBe('first • second line');
    expect(createTextPreview('abcdef', 3)).toBe('abc...');
  });

  it('says there is no content', () => {
    expect(createTextPreview('')).toBe('No content');
    expect(createTextPreview(42 as unknown as string)).toBe('No content');
  });
});
