/**
 * Tests for the shared timer-instance elapsed math.
 *
 * These sequences mirror the backend's stop computation in
 * crates/taskmint-core/src/timer.rs (compute_final_duration): the value the
 * UI shows while running/paused must equal what stop would record.
 */

import { describe, it, expect } from 'vitest';
import {
  getInstanceElapsedMs,
  getInstanceDateString,
  getSessionElapsedMs,
  getTimersOnDate,
  instanceTaskId,
  instanceTaskName,
  mostRecentlyPaused,
  sessionTaskNames,
  sessionTaskTotals,
  sessionTitle,
  getEntryElapsedMs,
  buildTimerEditUpdates,
  sessionsToTimeEntries,
} from '../../utils/timerHelpers';
import { TaskSession, TimeEntry, TimerInstance, TimerState } from '../../types/timer';

const T0 = new Date('2026-08-18T10:00:00.000Z').getTime();
const sec = (n: number) => n * 1000;

function instance(overrides: Partial<TimerInstance>): TimerInstance {
  return {
    id: 'instance_1',
    sessionId: 'session_1',
    startTime: new Date(T0).toISOString(),
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
      pausedAt: new Date(T0 + sec(110)).toISOString(),
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
      endTime: new Date(T0 + sec(120)).toISOString(),
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
      startTime: new Date(T0 + sec(1000)).toISOString(), // start in the future
    });
    expect(getInstanceElapsedMs(i, T0)).toBe(0);
  });

  it('accepts ISO-string timestamps as delivered over IPC', () => {
    const i = instance({
      state: TimerState.paused,
      startTime: new Date(T0).toISOString(),
      pausedAt: new Date(T0 + sec(50)).toISOString(),
      pausedDuration: sec(10),
    });
    expect(getInstanceElapsedMs(i)).toBe(sec(40));
  });
});

describe('getSessionElapsedMs', () => {
  function session(timerInstances: TimerInstance[]): TaskSession {
    return {
      id: 'session_1',
      taskId: 'task_1',
      taskName: 'Deep work',
      timerInstances,
      totalDuration: 0, // backend field: finalized instances only, ignored here
      isActive: true,
      date: '2026-08-18',
      createdAt: new Date(T0).toISOString(),
      updatedAt: new Date(T0).toISOString(),
    };
  }

  it('sums stopped, paused, and running instances at nowMs', () => {
    const s = session([
      instance({ id: 'a', state: TimerState.stopped, duration: sec(60) }),
      // frozen at (50 - 10) = 40s regardless of nowMs
      instance({
        id: 'b',
        state: TimerState.paused,
        pausedAt: new Date(T0 + sec(50)).toISOString(),
        pausedDuration: sec(10),
      }),
      // live: (100 - 30) = 70s at nowMs
      instance({ id: 'c', state: TimerState.running, pausedDuration: sec(30) }),
    ]);
    expect(getSessionElapsedMs(s, T0 + sec(100))).toBe(sec(170));
  });

  it('returns 0 for a session with no timer instances', () => {
    expect(getSessionElapsedMs(session([]))).toBe(0);
  });

  it('returns 0 for malformed sessions without a timerInstances array', () => {
    expect(getSessionElapsedMs({ id: 'x' } as unknown as TaskSession)).toBe(0);
  });
});

describe('getInstanceDateString', () => {
  // Local-noon constructors keep the local calendar date identical in every
  // timezone the suite might run in.
  const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

  it('returns the local date the instance started on', () => {
    const i = instance({ startTime: localNoon(2026, 8, 18).toISOString() });
    expect(getInstanceDateString(i)).toBe('2026-08-18');
  });

  it('accepts ISO-string timestamps as delivered over IPC', () => {
    const i = instance({
      startTime: localNoon(2026, 8, 17).toISOString(),
    });
    expect(getInstanceDateString(i)).toBe('2026-08-17');
  });

  it('falls back to the provided date for missing or invalid startTime', () => {
    const missing = instance({ startTime: undefined });
    expect(getInstanceDateString(missing, '2026-08-01')).toBe('2026-08-01');

    const invalid = instance({ startTime: 'garbage' });
    expect(getInstanceDateString(invalid, '2026-08-01')).toBe('2026-08-01');
    expect(getInstanceDateString(invalid)).toBe('');
  });
});

describe('getTimersOnDate', () => {
  const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

  it('buckets each timer by its own start date, not session.date', () => {
    const s: TaskSession = {
      id: 'session_1',
      taskId: 'task_1',
      taskName: 'Deep work',
      timerInstances: [
        instance({ id: 'a', state: TimerState.stopped, startTime: localNoon(2026, 8, 17).toISOString() }),
        instance({ id: 'b', state: TimerState.running, startTime: localNoon(2026, 8, 18).toISOString() }),
      ],
      totalDuration: 0,
      isActive: true,
      // Frozen at session creation: deliberately NOT the date the timers ran.
      date: '2026-08-17',
      createdAt: new Date(T0).toISOString(),
      updatedAt: new Date(T0).toISOString(),
    };

    expect(getTimersOnDate(s, '2026-08-18').map(t => t.id)).toEqual(['b']);
    expect(getTimersOnDate(s, '2026-08-17').map(t => t.id)).toEqual(['a']);
    expect(getTimersOnDate(s, '2026-08-16')).toEqual([]);
  });
});

describe('a session on several tasks', () => {
  const other = { taskId: 'task_2', taskName: 'Review', hourlyRate: 30 };
  const session = (timerInstances: TimerInstance[]): TaskSession => ({
    id: 'session_1',
    taskId: 'task_1',
    taskName: 'Deep work',
    timerInstances,
    totalDuration: 0,
    isActive: true,
    hourlyRate: 60,
    date: '2026-08-18',
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
  });
  const stopped = (id: string, seconds: number, task: TimerInstance['task'] = null) =>
    instance({ id, state: TimerState.stopped, duration: sec(seconds), task });

  it("reads a timer's task from itself, else its session", () => {
    const s = session([]);
    expect(instanceTaskId(stopped('a', 1), s)).toBe('task_1');
    expect(instanceTaskName(stopped('a', 1), s)).toBe('Deep work');
    expect(instanceTaskId(stopped('b', 1, other), s)).toBe('task_2');
    expect(instanceTaskName(stopped('b', 1, other), s)).toBe('Review');
  });

  it('totals each task that ran, in the order they first appear', () => {
    const s = session([
      stopped('a', 60, other),
      stopped('b', 30),
      stopped('c', 15, other),
      instance({ id: 'live', state: TimerState.running, startTime: new Date(T0).toISOString() }),
    ]);

    expect(sessionTaskTotals(s, T0 + sec(5))).toEqual([
      { taskId: 'task_2', taskName: 'Review', elapsedMs: sec(75) },
      { taskId: 'task_1', taskName: 'Deep work', elapsedMs: sec(35) },
    ]);
  });

  it("leaves out a task whose only timer hasn't started", () => {
    const s = session([stopped('a', 60), instance({ id: 'idle', state: TimerState.idle, task: other })]);

    expect(sessionTaskTotals(s).map(total => total.taskName)).toEqual(['Deep work']);
    expect(sessionTaskNames(s)).toEqual(['Deep work']);
  });

  it("names a session after the tasks that ran, or its own before any has", () => {
    expect(sessionTitle(session([]))).toBe('Deep work');
    expect(sessionTitle(session([instance({ state: TimerState.idle, task: other })]))).toBe('Deep work');
    expect(sessionTitle(session([stopped('a', 1, other)]))).toBe('Review');
    expect(sessionTitle(session([stopped('a', 1), stopped('b', 1, other)]))).toBe('Deep work, Review');
  });

  it('finds the timer paused last', () => {
    const paused = (id: string, pausedAt: string | null) => instance({ id, state: TimerState.paused, pausedAt });
    const s = session([
      stopped('done', 1),
      paused('unstamped', null),
      paused('latest', '2026-08-18T10:30:00.000Z'),
      paused('earlier', '2026-08-18T10:10:00.000Z'),
    ]);

    expect(mostRecentlyPaused(s)?.id).toBe('latest');
    expect(mostRecentlyPaused(session([stopped('done', 1)]))).toBeUndefined();
  });

  it("gives each time entry its timer's task and rate", () => {
    const entries = sessionsToTimeEntries([session([stopped('a', 1), stopped('b', 1, other)])]);

    expect(entries[0]).toMatchObject({ taskId: 'task_1', taskName: 'Deep work', hourlyRate: 60 });
    expect(entries[1]).toMatchObject({ taskId: 'task_2', taskName: 'Review', hourlyRate: 30 });
    // Another task's timer without a rate doesn't take the session's
    const unrated = sessionsToTimeEntries([session([stopped('a', 1, { ...other, hourlyRate: null })])]);
    expect(unrated[0].hourlyRate).toBeNull();
  });
});

describe('sessionsToTimeEntries', () => {
  // Local-noon constructor keeps the local calendar date identical in every
  // timezone the suite might run in.
  const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

  it('flattens instances with session task info and derives isRunning from state', () => {
    const session: TaskSession = {
      id: 'session_1',
      taskId: 'task_1',
      taskName: 'Deep work',
      timerInstances: [
        instance({ id: 'a', state: TimerState.running, startTime: localNoon(2026, 8, 18).toISOString() }),
        instance({ id: 'b', state: TimerState.stopped, duration: sec(60), startTime: localNoon(2026, 8, 18).toISOString() }),
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

  it('dates each entry by its own local start date, not session.date', () => {
    // Sessions are reactivated across days with their date frozen at
    // creation; entries must land on the day the timer actually ran so
    // Calendar and daily-goal bucketing agree with the Sessions dashboard.
    const session: TaskSession = {
      id: 'session_1',
      taskId: 'task_1',
      taskName: 'Deep work',
      timerInstances: [
        instance({ id: 'old', state: TimerState.stopped, duration: sec(60), startTime: localNoon(2026, 8, 17).toISOString() }),
        instance({ id: 'new', state: TimerState.running, startTime: localNoon(2026, 8, 18).toISOString() }),
        // Invalid startTime falls back to the session date.
        instance({ id: 'bad', state: TimerState.idle, startTime: 'garbage' }),
      ],
      totalDuration: sec(60),
      isActive: true,
      date: '2026-08-18',
      createdAt: new Date(T0).toISOString(),
      updatedAt: new Date(T0).toISOString(),
    };

    const entries = sessionsToTimeEntries([session]);
    expect(entries.map(e => e.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-18']);
  });

  it('skips malformed sessions without timerInstances arrays', () => {
    const malformed = { id: 'x' } as unknown as TaskSession;
    expect(sessionsToTimeEntries([malformed])).toEqual([]);
  });
});

describe('buildTimerEditUpdates', () => {
  it('derives endTime from start + pausedDuration + duration and stops the timer', () => {
    // The backend invariant: duration = endTime - startTime - pausedDuration.
    const i = instance({ pausedDuration: sec(30) });
    const updates = buildTimerEditUpdates(i, sec(90));

    expect(updates).toEqual({
      duration: sec(90),
      endTime: new Date(T0 + sec(30) + sec(90)).toISOString(),
      isRunning: false,
      isPaused: false,
    });
  });

  it('treats a missing pausedDuration as zero', () => {
    const i = instance({});
    const updates = buildTimerEditUpdates(i, sec(60));
    expect(updates.endTime).toBe(new Date(T0 + sec(60)).toISOString());
  });

  it('rounds and clamps the duration for the backend u64 field', () => {
    const i = instance({});
    expect(buildTimerEditUpdates(i, 1000.6).duration).toBe(1001);
    expect(buildTimerEditUpdates(i, -5000).duration).toBe(0);
  });

  it('accepts string startTime values off the IPC boundary', () => {
    const i = instance({ startTime: new Date(T0).toISOString() });
    const updates = buildTimerEditUpdates(i, sec(45));
    expect(updates.endTime).toBe(new Date(T0 + sec(45)).toISOString());
  });
});

describe('getEntryElapsedMs', () => {
  it('uses live instance math for entries that carry a timer state', () => {
    // sessionsToTimeEntries spreads the raw instance, so running entries
    // carry state/pausedDuration.
    const running = {
      ...instance({ state: TimerState.running, pausedDuration: sec(30) }),
      taskName: 'Deep work',
      date: '2026-08-18',
    } as unknown as TimeEntry;
    expect(getEntryElapsedMs(running, T0 + sec(100))).toBe(sec(70));
  });

  it('falls back to the stored duration for plain stopped entries', () => {
    const entry = {
      id: 'e1',
      taskName: 'Deep work',
      startTime: new Date(T0).toISOString(),
      duration: sec(60),
      isRunning: false,
      date: '2026-08-18',
    } as unknown as TimeEntry;
    expect(getEntryElapsedMs(entry)).toBe(sec(60));
  });

  it('returns 0 for entries with no state and no duration', () => {
    const entry = {
      id: 'e2',
      taskName: 'Deep work',
      startTime: new Date(T0).toISOString(),
      isRunning: false,
      date: '2026-08-18',
    } as unknown as TimeEntry;
    expect(getEntryElapsedMs(entry)).toBe(0);
  });
});
