/**
 * Tests for formatting utilities including timer rounding
 */

import {
  formatTime,
  formatDuration,
  applyTimerRounding,
  getRoundingOptionLabel,
  TimerRoundingOption,
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

describe('applyTimerRounding', () => {
  describe('none rounding', () => {
    it('should return original duration when rounding is none', () => {
      expect(applyTimerRounding(123456, 'none')).toBe(123456);
      expect(applyTimerRounding(0, 'none')).toBe(0);
    });
  });

  describe('up-5min rounding', () => {
    it('should round up to nearest 5 minutes', () => {
      // 1 minute -> 5 minutes
      expect(applyTimerRounding(60000, 'up-5min')).toBe(300000);
      // 4 minutes -> 5 minutes
      expect(applyTimerRounding(240000, 'up-5min')).toBe(300000);
      // 5 minutes -> 5 minutes (exact)
      expect(applyTimerRounding(300000, 'up-5min')).toBe(300000);
      // 6 minutes -> 10 minutes
      expect(applyTimerRounding(360000, 'up-5min')).toBe(600000);
    });
  });

  describe('up-15min rounding', () => {
    it('should round up to nearest 15 minutes', () => {
      // 1 minute -> 15 minutes
      expect(applyTimerRounding(60000, 'up-15min')).toBe(900000);
      // 14 minutes -> 15 minutes
      expect(applyTimerRounding(840000, 'up-15min')).toBe(900000);
      // 15 minutes -> 15 minutes (exact)
      expect(applyTimerRounding(900000, 'up-15min')).toBe(900000);
      // 16 minutes -> 30 minutes
      expect(applyTimerRounding(960000, 'up-15min')).toBe(1800000);
    });
  });

  describe('up-30min rounding', () => {
    it('should round up to nearest 30 minutes', () => {
      // 1 minute -> 30 minutes
      expect(applyTimerRounding(60000, 'up-30min')).toBe(1800000);
      // 29 minutes -> 30 minutes
      expect(applyTimerRounding(1740000, 'up-30min')).toBe(1800000);
      // 30 minutes -> 30 minutes (exact)
      expect(applyTimerRounding(1800000, 'up-30min')).toBe(1800000);
      // 31 minutes -> 60 minutes
      expect(applyTimerRounding(1860000, 'up-30min')).toBe(3600000);
    });
  });

  describe('edge cases', () => {
    it('should handle zero duration', () => {
      expect(applyTimerRounding(0, 'up-5min')).toBe(0);
      expect(applyTimerRounding(0, 'up-15min')).toBe(0);
      expect(applyTimerRounding(0, 'up-30min')).toBe(0);
    });

    it('should handle negative duration', () => {
      expect(applyTimerRounding(-1000, 'up-5min')).toBe(-1000);
      expect(applyTimerRounding(-1000, 'up-15min')).toBe(-1000);
      expect(applyTimerRounding(-1000, 'up-30min')).toBe(-1000);
    });
  });
});

describe('getRoundingOptionLabel', () => {
  it('should return correct labels for rounding options', () => {
    expect(getRoundingOptionLabel('none')).toBe('No rounding');
    expect(getRoundingOptionLabel('up-5min')).toBe('Round up to 5 minutes');
    expect(getRoundingOptionLabel('up-15min')).toBe('Round up to 15 minutes');
    expect(getRoundingOptionLabel('up-30min')).toBe('Round up to 30 minutes');
  });

  it('should handle invalid options gracefully', () => {
    expect(getRoundingOptionLabel('invalid' as TimerRoundingOption)).toBe('No rounding');
  });
});
