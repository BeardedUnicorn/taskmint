import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCES_KEY,
  parseNotificationPreferences,
  useNotificationPreferences,
} from '../preferences';

describe('notification preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults: system notifications on, sound off, backup successes off, summary at 18:00', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toMatchObject({
      desktopEnabled: true,
      sound: false,
      backupSuccess: false,
      dailySummary: true,
      dailySummaryTime: '18:00',
    });
  });

  it('keeps the valid fields when one is bad', () => {
    const parsed = parseNotificationPreferences({ sound: true, dailySummaryTime: '25:99', goalMilestones: 'yes' });
    expect(parsed.sound).toBe(true);
    expect(parsed.dailySummaryTime).toBe('18:00');
    expect(parsed.goalMilestones).toBe(true);
    expect(parseNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('saves updates on top of what is stored', () => {
    const { result } = renderHook(() => useNotificationPreferences());
    act(() => result.current[1]({ sound: true }));
    act(() => result.current[1]({ dailySummaryTime: '17:30' }));

    expect(result.current[0]).toMatchObject({ sound: true, dailySummaryTime: '17:30' });
    expect(JSON.parse(localStorage.getItem(NOTIFICATION_PREFERENCES_KEY)!).data).toMatchObject({
      sound: true,
      dailySummaryTime: '17:30',
    });
  });
});
