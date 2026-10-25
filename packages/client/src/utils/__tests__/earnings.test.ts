import { describe, it, expect } from 'vitest';
import {
  earningsForMs,
  earningsOnDate,
  entryEarnings,
  entryRate,
  findTaskFor,
  sessionEarnings,
  sessionRate,
} from '../earnings';
import { Task } from '../../types/task';
import { TaskSession, TimeEntry, TimerInstance, TimerState } from '../../types/timer';

const HOUR = 3_600_000;

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: 'Annotation',
  hourlyRate: 60,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const instance = (overrides: Partial<TimerInstance> = {}): TimerInstance => ({
  id: 'i-1',
  sessionId: 's-1',
  startTime: new Date(2026, 9, 10, 9, 0),
  endTime: new Date(2026, 9, 10, 10, 0),
  duration: HOUR,
  state: TimerState.stopped,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  ...overrides,
});

const session = (overrides: Partial<TaskSession> = {}): TaskSession => ({
  id: 's-1',
  taskId: 'task-1',
  taskName: 'Annotation',
  timerInstances: [instance()],
  totalDuration: HOUR,
  isActive: false,
  date: '2026-10-10',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  ...overrides,
});

const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'i-1',
  taskId: 'task-1',
  taskName: 'Annotation',
  startTime: new Date(2026, 9, 10, 9, 0),
  endTime: new Date(2026, 9, 10, 10, 0),
  duration: HOUR,
  isRunning: false,
  date: '2026-10-10',
  ...overrides,
});

describe('rates', () => {
  it("uses the session's own rate over the task's current one", () => {
    expect(sessionRate(session({ hourlyRate: 40 }), [task({ hourlyRate: 60 })])).toBe(40);
    expect(entryRate(entry({ hourlyRate: 40 }), [task({ hourlyRate: 60 })])).toBe(40);
  });

  it("falls back to the task's current rate, by id then by name", () => {
    expect(sessionRate(session(), [task({ hourlyRate: 60 })])).toBe(60);
    const legacy = session({ taskId: 'new-task' });
    expect(sessionRate(legacy, [task({ hourlyRate: 55 })])).toBe(55);
  });

  it('is 0 without any rate', () => {
    expect(sessionRate(session(), [task({ hourlyRate: undefined })])).toBe(0);
    expect(entryRate(entry({ taskId: 'gone', taskName: 'Gone' }), [task()])).toBe(0);
    expect(sessionRate(session({ hourlyRate: -5 }), [task({ hourlyRate: undefined })])).toBe(0);
  });

  it('finds tasks by id first', () => {
    const byName = task({ id: 'other', name: 'Annotation' });
    const byId = task({ id: 'task-1', name: 'Renamed' });
    expect(findTaskFor({ taskId: 'task-1', taskName: 'Annotation' }, [byName, byId])).toBe(byId);
  });
});

describe('earnings', () => {
  it('is rate × hours', () => {
    expect(earningsForMs(1.5 * HOUR, 40)).toBe(60);
    expect(earningsForMs(HOUR, 0)).toBe(0);
    expect(earningsForMs(-HOUR, 40)).toBe(0);
  });

  it("doesn't move when the task's rate changes later", () => {
    const tracked = entry({ hourlyRate: 40 });
    expect(entryEarnings(tracked, [task({ hourlyRate: 40 })])).toBe(40);
    expect(entryEarnings(tracked, [task({ hourlyRate: 90 })])).toBe(40);
  });

  it('counts finished entries only', () => {
    expect(entryEarnings(entry({ isRunning: true, duration: undefined }), [task()])).toBe(0);
  });

  it('counts a running timer live for a session', () => {
    const running = session({
      hourlyRate: 60,
      timerInstances: [
        instance(),
        instance({
          id: 'i-2',
          startTime: new Date(2026, 9, 10, 11, 0),
          endTime: undefined,
          duration: undefined,
          state: TimerState.running,
        }),
      ],
    });
    const nowMs = new Date(2026, 9, 10, 11, 30).getTime();
    expect(sessionEarnings(running, [task()], nowMs)).toBeCloseTo(90, 10);
  });

  it('buckets by the day each timer started, at each session\'s rate', () => {
    const yesterday = session({
      id: 's-a',
      hourlyRate: 40,
      timerInstances: [instance({ startTime: new Date(2026, 9, 9, 22, 0), endTime: new Date(2026, 9, 9, 23, 0) })],
    });
    const today = session({ id: 's-b', hourlyRate: 50 });
    const nowMs = new Date(2026, 9, 10, 18, 0).getTime();

    expect(earningsOnDate([yesterday, today], [task()], '2026-10-10', nowMs)).toBe(50);
    expect(earningsOnDate([yesterday, today], [task()], '2026-10-09', nowMs)).toBe(40);
  });
});
