/**
 * Tests for formatting utilities
 */

import {
  formatTime,
  formatDuration,
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

describe('formatDuration', () => {
  it('should format milliseconds to human-readable format', () => {
    expect(formatDuration(0)).toBe('0h 0m');
    expect(formatDuration(60000)).toBe('0h 1m');
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(3661000)).toBe('1h 1m');
  });
});
