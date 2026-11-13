/**
 * The goal milestone alarms a phone set today, so the app doesn't announce a
 * milestone again that an alarm already did.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ALARM_SLACK_MS, GOAL_ALARMS_KEY, goalAlarmAnnounced, noteGoalAlarm } from '../goalAlarms';

const NOW = new Date(2026, 10, 13, 14, 0).getTime();
const HOUR = 3_600_000;

beforeEach(() => {
  localStorage.clear();
});

describe('goal alarms', () => {
  it("counts a milestone announced once its alarm's time comes (or nearly)", () => {
    noteGoalAlarm(50, NOW + HOUR, NOW);
    expect(goalAlarmAnnounced(50, NOW)).toBe(false);
    expect(goalAlarmAnnounced(50, NOW + HOUR - ALARM_SLACK_MS)).toBe(true);
    expect(goalAlarmAnnounced(50, NOW + 2 * HOUR)).toBe(true);
    expect(goalAlarmAnnounced(75, NOW + 2 * HOUR)).toBe(false);
  });

  it('forgets an alarm taken back before it went off, but not one that did', () => {
    noteGoalAlarm(50, NOW - HOUR, NOW - 2 * HOUR);
    noteGoalAlarm(75, NOW + HOUR, NOW);
    noteGoalAlarm(50, null, NOW);
    noteGoalAlarm(75, null, NOW);
    noteGoalAlarm(100, null, NOW);
    expect(goalAlarmAnnounced(50, NOW)).toBe(true);
    expect(goalAlarmAnnounced(75, NOW + 2 * HOUR)).toBe(false);
  });

  it("starts each day over, and reads nothing it can't", () => {
    noteGoalAlarm(50, NOW, NOW);
    expect(goalAlarmAnnounced(50, NOW + 24 * HOUR)).toBe(false);
    localStorage.setItem(GOAL_ALARMS_KEY, 'not json');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(goalAlarmAnnounced(50, NOW)).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
