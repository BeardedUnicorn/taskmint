import { describe, it, expect } from 'vitest';
import { routeNotification, ErrorThrottle } from '../routing';
import { DEFAULT_NOTIFICATION_PREFERENCES as defaults } from '../preferences';

const away = { attended: false, preferences: defaults };
const here = { attended: true, preferences: defaults };

describe('routeNotification', () => {
  it('keeps everyday messages in the window', () => {
    expect(routeNotification({ category: 'task', severity: 'success' }, away)).toEqual({ toast: true, desktop: null });
  });

  it('sends captures, backup failures and errors to the OS only while you are away', () => {
    expect(routeNotification({ category: 'workLog', severity: 'success' }, here)).toEqual({ toast: true, desktop: null });
    expect(routeNotification({ category: 'workLog', severity: 'success' }, away)).toEqual({
      toast: true,
      desktop: 'workLogCapture',
    });
    expect(routeNotification({ category: 'backup', severity: 'error' }, away).desktop).toBe('backupFailure');
    expect(routeNotification({ category: 'session', severity: 'error' }, away).desktop).toBe('error');
  });

  it('keeps backup successes in the window unless that setting is on', () => {
    expect(routeNotification({ category: 'backup', severity: 'success' }, away).desktop).toBeNull();
    const on = { ...away, preferences: { ...defaults, backupSuccess: true } };
    expect(routeNotification({ category: 'backup', severity: 'success' }, on).desktop).toBe('backupSuccess');
  });

  it('sends reminders to the OS always, with a toast too while you are looking', () => {
    expect(routeNotification({ category: 'goal', severity: 'success' }, away)).toEqual({
      toast: false,
      desktop: 'goalMilestone',
    });
    expect(routeNotification({ category: 'goal', severity: 'success' }, here)).toEqual({
      toast: true,
      desktop: 'goalMilestone',
    });
  });

  it('silences a reminder whose category is off', () => {
    const off = { ...here, preferences: { ...defaults, dailySummary: false } };
    expect(routeNotification({ category: 'dailySummary', severity: 'info' }, off)).toEqual({
      toast: false,
      desktop: null,
    });
  });

  it('keeps everything in the window with system notifications off, except the test', () => {
    const off = { ...away, preferences: { ...defaults, desktopEnabled: false } };
    expect(routeNotification({ category: 'goal', severity: 'success' }, off)).toEqual({ toast: true, desktop: null });
    expect(routeNotification({ category: 'session', severity: 'error' }, off).desktop).toBeNull();
    expect(routeNotification({ category: 'test', severity: 'info' }, off).desktop).toBe('test');
  });

  it("drops errors' OS copy when that setting is off", () => {
    const off = { ...away, preferences: { ...defaults, errorsWhileAway: false } };
    expect(routeNotification({ category: 'general', severity: 'error' }, off)).toEqual({ toast: true, desktop: null });
  });

  it('lets a caller force or forbid the OS', () => {
    expect(routeNotification({ category: 'workLog', severity: 'info', desktop: 'never' }, away).desktop).toBeNull();
    expect(routeNotification({ category: 'general', severity: 'info', desktop: 'always' }, here).desktop).toBe('general');
  });
});

describe('ErrorThrottle', () => {
  it('allows one per message a minute and three in ten minutes', () => {
    const throttle = new ErrorThrottle();
    expect(throttle.allow('a', 0)).toBe(true);
    expect(throttle.allow('a', 30_000)).toBe(false);
    expect(throttle.allow('a', 60_000)).toBe(true);
    expect(throttle.allow('b', 61_000)).toBe(true);
    expect(throttle.allow('c', 62_000)).toBe(false); // fourth in ten minutes
    expect(throttle.allow('c', 600_001)).toBe(true);
  });

  it('starts over after a reset', () => {
    const throttle = new ErrorThrottle();
    throttle.allow('a', 0);
    throttle.reset();
    expect(throttle.allow('a', 1)).toBe(true);
  });
});
