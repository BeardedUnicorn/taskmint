/**
 * Tests for the shared timer-instance elapsed math.
 *
 * These sequences mirror the backend's stop computation in
 * src-tauri/src/commands/sessions.rs (compute_final_duration): the value the
 * UI shows while running/paused must equal what stop would record.
 */

import { describe, it, expect } from 'vitest';
import { getInstanceElapsedMs, sessionsToTimeEntries } from '../../utils/timerHelpers';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';

const T0 = new Date('2026-08-18T10:00:00.000Z').getTime();
const sec = (n: number) => n * 1000;

function instance(overrides: Partial<TimerInstance>): TimerInstance {
  return {
    id: 'instance_1',
    sessionId: 'session_1',
    startTime: new Date(T0),
    state: TimerState.idle,
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...overrides,
  };
}

describe('getInstanceElapsedMs', () => {
  it('returns wall-clock elapsed for a running timer with no pauses', () => {
    const i = instance({ state: TimerState.running });
    expect(getInstanceElapsedMs(i, T0 + sec(90))).toBe(sec(90));
  });

  it('subtracts accumulated pause time while running (post-resume)', () => {
    // ran 60s, paused 30s, resumed; at t=100s tracked time is 70s
    const i = instance({
      state: TimerState.running,
      pausedDuration: sec(30),
    });
    expect(getInstanceElapsedMs(i, T0 + sec(100))).toBe(sec(70));
  });

  it('freezes the display while paused, excluding earlier pauses', () => {
    // ran 60s, paused 30s, resumed, ran 20s, paused again at t=110s
    const i = instance({
      state: TimerState.paused,
      pausedAt: new Date(T0 + sec(110)),
      pausedDuration: sec(30),
    });
    // tracked = 110 - 30 = 80s, regardless of "now"
    expect(getInstanceElapsedMs(i, T0 + sec(500))).toBe(sec(80));
  });

  it('matches the duration the backend records at stop after pause/resume', () => {
    // Sequence: start at 0, pause at 60, resume at 90, stop at 120.
    // Backend records (120 - 0) - 30 = 90s.
    const runningAfterResume = instance({
      state: TimerState.running,
      pausedDuration: sec(30),
    });
    const liveJustBeforeStop = getInstanceElapsedMs(runningAfterResume, T0 + sec(120));
    expect(liveJustBeforeStop).toBe(sec(90)); // no drop when stop lands

    const stopped = instance({
      state: TimerState.stopped,
      endTime: new Date(T0 + sec(120)),
      duration: sec(90),
      pausedDuration: sec(30),
    });
    expect(getInstanceElapsedMs(stopped)).toBe(sec(90));
  });

  it('returns stored duration for stopped timers and 0 for idle ones', () => {
    expect(getInstanceElapsedMs(instance({ state: TimerState.stopped, duration: sec(42) }))).toBe(sec(42));
    expect(getInstanceElapsedMs(instance({ state: TimerState.idle }))).toBe(0);
  });

  it('never returns a negative value', () => {
    const i = instance({
      state: TimerState.running,
      startTime: new Date(T0 + sec(1000)), // start in the future
    });
    expect(getInstanceElapsedMs(i, T0)).toBe(0);
  });

  it('accepts ISO-string timestamps as delivered over IPC', () => {
    const i = instance({
      state: TimerState.paused,
      startTime: new Date(T0).toISOString() as unknown as Date,
      pausedAt: new Date(T0 + sec(50)).toISOString() as unknown as Date,
      pausedDuration: sec(10),
    });
    expect(getInstanceElapsedMs(i)).toBe(sec(40));
  });
});

describe('sessionsToTimeEntries', () => {
  it('flattens instances with session task info and derives isRunning from state', () => {
    const session: TaskSession = {
      id: 'session_1',
      taskId: 'task_1',
      taskName: 'Deep work',
      timerInstances: [
        instance({ id: 'a', state: TimerState.running }),
        instance({ id: 'b', state: TimerState.stopped, duration: sec(60) }),
      ],
      totalDuration: sec(60),
      isActive: true,
      date: '2026-08-18',
      createdAt: new Date(T0).toISOString(),
      updatedAt: new Date(T0).toISOString(),
    };

    const entries = sessionsToTimeEntries([session]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: 'a',
      taskName: 'Deep work',
      taskId: 'task_1',
      date: '2026-08-18',
      isRunning: true,
    });
    expect(entries[1]).toMatchObject({ id: 'b', isRunning: false, duration: sec(60) });
  });

  it('skips malformed sessions without timerInstances arrays', () => {
    const malformed = { id: 'x' } as unknown as TaskSession;
    expect(sessionsToTimeEntries([malformed])).toEqual([]);
  });
});
