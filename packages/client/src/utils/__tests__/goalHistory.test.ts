import { describe, it, expect } from 'vitest';
import { buildGoalHistory } from '../goalHistory';
import { DailyGoal, DailyGoalAchievement } from '../../types/goal';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';

const HOUR = 3_600_000;
const tasks: Task[] = [
  { id: 'task-1', name: 'Annotation', hourlyRate: 50, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

const entry = (date: string, hours: number, overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `${date}-${hours}`,
  taskId: 'task-1',
  taskName: 'Annotation',
  startTime: new Date(`${date}T10:00:00`),
  duration: hours * HOUR,
  isRunning: false,
  date,
  hourlyRate: 50,
  ...overrides,
});

const goal = (targetAmount: number, isEnabled = true): DailyGoal => ({
  targetAmount,
  currency: 'USD',
  isEnabled,
  lastNotifiedPercent: 0,
  lastNotificationDate: '',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const record = (date: string, goalAmount: number, earnedAmount = 0): DailyGoalAchievement => ({
  id: `rec-${date}`,
  date,
  goalAmount,
  earnedAmount,
  currency: 'USD',
  percentageAchieved: 0,
  status: 'missed',
  difference: 0,
  recordedAt: `${date}T23:00:00Z`,
});

const build = (overrides: Partial<Parameters<typeof buildGoalHistory>[0]> = {}) =>
  buildGoalHistory({
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    timeEntries: [],
    tasks,
    records: [],
    currentGoal: goal(100),
    ...overrides,
  });

describe('buildGoalHistory', () => {
  it('recomputes earnings from tracked time, ignoring the saved amount', () => {
    const rows = build({
      timeEntries: [entry('2026-10-05', 1), entry('2026-10-05', 1.5)],
      records: [record('2026-10-05', 100, 999)],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-10-05', goalAmount: 100, earnedAmount: 125, status: 'exceeded' });
    expect(rows[0].difference).toBe(25);
  });

  it("keeps a day's saved target when the goal changes later", () => {
    const rows = build({
      timeEntries: [entry('2026-10-05', 1)],
      records: [record('2026-10-05', 40)],
      currentGoal: goal(200),
    });
    expect(rows[0]).toMatchObject({ goalAmount: 40, earnedAmount: 50, status: 'exceeded' });
  });

  it('uses the current goal for days without a saved target', () => {
    const rows = build({ timeEntries: [entry('2026-10-06', 2)] });
    expect(rows[0]).toMatchObject({ goalAmount: 100, earnedAmount: 100, status: 'hit', percentageAchieved: 100 });
  });

  it('includes saved days without tracked time as missed', () => {
    const rows = build({ records: [record('2026-10-07', 80)] });
    expect(rows[0]).toMatchObject({ date: '2026-10-07', earnedAmount: 0, status: 'missed' });
  });

  it('leaves out days outside the range, and days with no goal at all', () => {
    const rows = build({
      timeEntries: [entry('2026-09-30', 1), entry('2026-10-08', 1)],
      currentGoal: goal(100, false),
    });
    expect(rows).toEqual([]);
  });

  it('lists the newest day first', () => {
    const rows = build({ timeEntries: [entry('2026-10-02', 1), entry('2026-10-09', 1), entry('2026-10-04', 1)] });
    expect(rows.map(r => r.date)).toEqual(['2026-10-09', '2026-10-04', '2026-10-02']);
  });
});
