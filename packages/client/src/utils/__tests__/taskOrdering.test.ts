import { describe, it, expect } from 'vitest';
import { lastUsedByTask, orderTasksForStart } from '../taskOrdering';
import { Task } from '../../types/task';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  name: `Task ${id}`,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const instance = (id: string, start: string): TimerInstance => ({
  id,
  sessionId: 's',
  startTime: new Date(start),
  state: TimerState.stopped,
  createdAt: start,
  updatedAt: start,
});

const session = (id: string, taskId: string, starts: string[]): TaskSession => ({
  id,
  taskId,
  taskName: `Task ${taskId}`,
  timerInstances: starts.map((start, n) => instance(`${id}-${n}`, start)),
  totalDuration: 0,
  isActive: false,
  date: '2026-10-01',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
});

const names = (tasks: Task[]) => tasks.map(t => t.id);

describe('lastUsedByTask', () => {
  it("takes each task's latest timer start across its sessions", () => {
    const lastUsed = lastUsedByTask([
      session('s1', 'a', ['2026-10-01T09:00:00Z', '2026-10-03T09:00:00Z']),
      session('s2', 'a', ['2026-10-02T09:00:00Z']),
      session('s3', 'b', ['2026-10-02T12:00:00Z']),
      session('s4', 'c', []),
    ]);

    expect(lastUsed.get('a')).toBe(Date.parse('2026-10-03T09:00:00Z'));
    expect(lastUsed.get('b')).toBe(Date.parse('2026-10-02T12:00:00Z'));
    expect(lastUsed.has('c')).toBe(false);
  });
});

describe('orderTasksForStart', () => {
  it('leaves out archived tasks', () => {
    const ordered = orderTasksForStart([task('a'), task('b', { isArchived: true })], []);
    expect(names(ordered)).toEqual(['a']);
  });

  it('puts the most recently used first, then never-used tasks by name', () => {
    const tasks = [
      task('z', { name: 'Zeta' }),
      task('y', { name: 'Alpha' }),
      task('x', { name: 'Old' }),
      task('w', { name: 'New' }),
    ];
    const sessions = [
      session('s1', 'x', ['2026-10-01T09:00:00Z']),
      session('s2', 'w', ['2026-10-05T09:00:00Z']),
    ];

    expect(names(orderTasksForStart(tasks, sessions))).toEqual(['w', 'x', 'y', 'z']);
  });

  it('pins favorites ahead of everything else, each group by recency', () => {
    const tasks = [
      task('a'),
      task('b', { isFavorite: true }),
      task('c'),
      task('d', { isFavorite: true }),
    ];
    const sessions = [
      session('s1', 'a', ['2026-10-09T09:00:00Z']), // most recent overall
      session('s2', 'd', ['2026-10-05T09:00:00Z']),
      session('s3', 'b', ['2026-10-01T09:00:00Z']),
    ];

    expect(names(orderTasksForStart(tasks, sessions))).toEqual(['d', 'b', 'a', 'c']);
  });

  it('does not reorder the array it was given', () => {
    const tasks = [task('b', { name: 'B' }), task('a', { name: 'A' })];
    orderTasksForStart(tasks, []);
    expect(names(tasks)).toEqual(['b', 'a']);
  });
});
