/**
 * Payout calculator tests. Work days are constructed from local wall times so
 * the assertions hold in any host timezone.
 */

import { describe, expect, it } from 'vitest';
import { Task } from '../../types/task';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { WorkLogEntry } from '../../types/workLog';
import {
  buildPayoutCells,
  buildReleaseEvents,
  buildReleaseSchedule,
  centsToDollars,
  formatCents,
  formatWholeCents,
  formatPayoutAmount,
  groupCellsByMonth,
  summarizePayouts,
  PayoutDayCell,
  ReleaseScheduleRow,
} from '../payoutCalculator';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayStr(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

const NOW_MS = new Date(2026, 7, 31, 12, 0).getTime();

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Raccoon - SWE',
    hourlyRate: 75,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Task;
}

function makeEntry(overrides: Partial<WorkLogEntry> = {}): WorkLogEntry {
  return {
    id: 'entry-1',
    kind: 'timed',
    createdAt: '2026-08-26T20:00:00.000Z',
    workDay: dayStr(2026, 8, 26),
    projectId: 'proj-1',
    projectName: 'Raccoon - SWE',
    taskId: 'task-1',
    taskName: 'Raccoon - SWE',
    timeInMinutes: 240,
    reportedTimeInMinutes: null,
    amountCents: 30000,
    status: 'Pending Approval',
    importedAt: '2026-08-31T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
    ...overrides,
  };
}

function makeInstance(overrides: Partial<TimerInstance> = {}): TimerInstance {
  return {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date(2026, 7, 26, 10, 0).toISOString(),
    endTime: new Date(2026, 7, 26, 12, 0).toISOString(),
    duration: 2 * 3_600_000,
    state: TimerState.stopped,
    isRunning: false,
    isPaused: false,
    createdAt: '2026-08-26T00:00:00Z',
    updatedAt: '2026-08-26T00:00:00Z',
    ...overrides,
  };
}

function makeSession(overrides: Partial<TaskSession> = {}): TaskSession {
  return {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Raccoon - SWE',
    timerInstances: [],
    totalDuration: 0,
    isActive: false,
    date: dayStr(2026, 8, 26),
    createdAt: '2026-08-26T00:00:00Z',
    updatedAt: '2026-08-26T00:00:00Z',
    ...overrides,
  };
}

function makeCell(overrides: Partial<PayoutDayCell> = {}): PayoutDayCell {
  return {
    workDay: dayStr(2026, 8, 26),
    taskId: 'task-1',
    taskName: 'Raccoon - SWE',
    actualCents: 0,
    estimatedCents: 0,
    trackedMs: 0,
    importedMinutes: 0,
    statuses: [],
    releaseDay: dayStr(2026, 9, 2),
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
    ...overrides,
  };
}

describe('buildPayoutCells', () => {
  it('lets a timed import replace the estimate for its (task, day)', () => {
    const tracked = makeInstance(); // 2h tracked on 8/26
    const sessions = [makeSession({ timerInstances: [tracked] })];
    const cells = buildPayoutCells([makeEntry()], sessions, [makeTask()], 7, NOW_MS);

    expect(cells).toHaveLength(1);
    expect(cells[0].actualCents).toBe(30000);
    expect(cells[0].estimatedCents).toBe(0);
    expect(cells[0].isEstimate).toBe(false);
    expect(cells[0].trackedMs).toBe(2 * 3_600_000);
    expect(cells[0].importedMinutes).toBe(240);
    expect(cells[0].releaseDay).toBe(dayStr(2026, 9, 2));
    expect(cells[0].statuses).toEqual(['Pending Approval']);
  });

  it('estimates from tracked time and rate when a day has no import', () => {
    const sessions = [makeSession({ timerInstances: [makeInstance()] })];
    const cells = buildPayoutCells([], sessions, [makeTask()], 7, NOW_MS);

    expect(cells).toHaveLength(1);
    expect(cells[0].actualCents).toBe(0);
    expect(cells[0].estimatedCents).toBe(15000); // 2h × $75
    expect(cells[0].isEstimate).toBe(true);
  });

  it('keeps a rate-less tracked day visible without an estimate', () => {
    const sessions = [makeSession({ timerInstances: [makeInstance()] })];
    const cells = buildPayoutCells([], sessions, [makeTask({ hourlyRate: undefined })], 7, NOW_MS);

    expect(cells).toHaveLength(1);
    expect(cells[0].estimatedCents).toBe(0);
    expect(cells[0].isEstimate).toBe(false);
    expect(cells[0].trackedMs).toBeGreaterThan(0);
  });

  it('adds workLog cents as actuals even on an estimate day', () => {
    const sessions = [makeSession({ timerInstances: [makeInstance()] })];
    const workLog = makeEntry({
      id: 'wl-1',
      kind: 'workLog',
      timeInMinutes: null,
      amountCents: 500,
      status: 'Untransferred',
    });
    const cells = buildPayoutCells([workLog], sessions, [makeTask()], 7, NOW_MS);

    expect(cells).toHaveLength(1);
    expect(cells[0].actualCents).toBe(500);
    expect(cells[0].untransferredCents).toBe(500);
    expect(cells[0].estimatedCents).toBe(15000);
  });

  it('computes untransferred and paid cents separately', () => {
    const e1 = makeEntry({ id: 'e1', amountCents: 2000, status: 'Untransferred' });
    const e2 = makeEntry({ id: 'e2', amountCents: 5000, status: 'Paid' });
    const e3 = makeEntry({ id: 'e3', amountCents: 1000, status: 'Pending Approval' });
    const cells = buildPayoutCells([e1, e2, e3], [], [makeTask()], 7, NOW_MS);

    expect(cells).toHaveLength(1);
    expect(cells[0].actualCents).toBe(8000);
    expect(cells[0].untransferredCents).toBe(2000);
    expect(cells[0].paidCents).toBe(5000);
  });

  it('falls back to the ledger task name when the task was deleted', () => {
    const cells = buildPayoutCells([makeEntry()], [], [], 7, NOW_MS);
    expect(cells[0].taskName).toBe('Raccoon - SWE');
  });

  it('honors the funds release setting', () => {
    const cells = buildPayoutCells([makeEntry()], [], [], 0, NOW_MS);
    expect(cells[0].releaseDay).toBe(cells[0].workDay);
  });

  it('sorts newest day first, then tasks by name', () => {
    const older = makeEntry({ id: 'old', workDay: dayStr(2026, 8, 20) });
    const other = makeEntry({ id: 'other', taskId: 'task-2', taskName: 'Annotation' });
    const cells = buildPayoutCells([older, makeEntry(), other], [], [], 7, NOW_MS);
    expect(cells.map(c => [c.workDay, c.taskName])).toEqual([
      [dayStr(2026, 8, 26), 'Annotation'],
      [dayStr(2026, 8, 26), 'Raccoon - SWE'],
      [dayStr(2026, 8, 20), 'Raccoon - SWE'],
    ]);
  });

  it('drops days with nothing on them, and timers with no day', () => {
    const empty = makeSession({ timerInstances: [makeInstance({ endTime: makeInstance().startTime, duration: 0 })] });
    const undated = makeSession({
      id: 's2',
      date: '',
      timerInstances: [makeInstance({ id: 'x', startTime: 'garbled' })],
    });
    expect(buildPayoutCells([], [empty, undated], [makeTask()], 7, NOW_MS)).toEqual([]);
  });

  it("releases an estimate a week after the day's last timer, or after now for one still running", () => {
    const finished = makeSession({ timerInstances: [makeInstance()] });
    const [cell] = buildPayoutCells([], [finished], [makeTask()], 7, NOW_MS);
    expect(cell.releaseIso).toBe(new Date(2026, 8, 2, 12, 0).toISOString());
    expect(cell.releaseTime).toBe('12:00 PM');

    const running = makeInstance({
      id: 'live',
      endTime: undefined,
      state: TimerState.running,
      isRunning: true,
      startTime: new Date(2026, 7, 31, 11, 0).toISOString(),
    });
    const [live] = buildPayoutCells(
      [],
      [makeSession({ date: dayStr(2026, 8, 31), timerInstances: [running] })],
      [makeTask()],
      7,
      NOW_MS
    );
    expect(live.releaseIso).toBe(new Date(NOW_MS + 7 * 86_400_000).toISOString());
  });

  it('releases a day without timers, or with an odd report time, on its work day plus the release days', () => {
    const workLog = makeEntry({ id: 'wl', kind: 'workLog', timeInMinutes: null, amountCents: 500, status: 'Paid' });
    const [bonus] = buildPayoutCells([workLog], [], [makeTask()], 7, NOW_MS);
    expect([bonus.releaseDay, bonus.releaseTime, bonus.paidCents]).toEqual([dayStr(2026, 9, 2), undefined, 500]);

    for (const createdAt of ['2026-09-20T12:00:00.000Z', 'not a date']) {
      const [cell] = buildPayoutCells([makeEntry({ createdAt })], [], [makeTask()], 7, NOW_MS);
      expect([cell.releaseDay, cell.releaseTime]).toEqual([dayStr(2026, 9, 2), undefined]);
    }
  });

  it("releases an imported day a week after its latest report, apart from other tasks' time", () => {
    const first = makeEntry({ id: 'first', createdAt: '2026-08-26T16:00:00.000Z' });
    const latest = makeEntry({ id: 'latest', createdAt: '2026-08-26T22:00:00.000Z' });
    const others = makeSession({ id: 'others', taskId: 'task-2', timerInstances: [makeInstance({ id: 'theirs' })] });
    // And an estimate day of its own, earlier
    const mine = makeSession({
      id: 'mine',
      date: dayStr(2026, 8, 20),
      timerInstances: [
        makeInstance({
          id: 'mine',
          startTime: new Date(2026, 7, 20, 10, 0).toISOString(),
          endTime: new Date(2026, 7, 20, 11, 0).toISOString(),
        }),
      ],
    });
    const cells = buildPayoutCells(
      [first, latest],
      [others, mine],
      [makeTask(), makeTask({ id: 'task-2', name: 'Annotation' })],
      7,
      NOW_MS
    );
    const imported = cells.find(cell => cell.taskId === 'task-1')!;
    expect(imported.releaseIso).toBe('2026-09-02T22:00:00.000Z');
    expect(imported.trackedMs).toBe(0);
    expect(cells.find(cell => cell.taskId === 'task-2')!.estimatedCents).toBe(15000);
  });

  it("gives each task its own timers' time and rate within one session", () => {
    const tasks = [makeTask(), makeTask({ id: 'task-2', name: 'Review', hourlyRate: 40 })];
    const session = makeSession({
      hourlyRate: 75,
      timerInstances: [
        makeInstance({ id: 'own', duration: 3_600_000 }),
        makeInstance({
          id: 'other',
          duration: 2 * 3_600_000,
          endTime: new Date(2026, 7, 26, 15, 0).toISOString(),
          task: { taskId: 'task-2', taskName: 'Review', hourlyRate: 50 },
        }),
      ],
    });

    const cells = buildPayoutCells([], [session], tasks, 7, NOW_MS);

    expect(cells.map(cell => [cell.taskId, cell.trackedMs, cell.estimatedCents])).toEqual([
      ['task-1', 3_600_000, 7500],
      ['task-2', 2 * 3_600_000, 10000],
    ]);
    // Each task's release follows its own timers
    expect(cells[0].releaseTime).toBe('12:00 PM');
    expect(cells[1].releaseTime).toBe('3:00 PM');
  });

  it("leaves a tracked day's name blank when its task is gone", () => {
    const [cell] = buildPayoutCells(
      [],
      [makeSession({ taskId: 'deleted', timerInstances: [makeInstance()] })],
      [],
      7,
      NOW_MS
    );
    expect(cell.taskName).toBe('');
  });
});

describe('formatPayoutAmount', () => {
  it('shows imported money, then estimates, or a dash', () => {
    expect(formatPayoutAmount(0, 0)).toBe('—');
    expect(formatPayoutAmount(123400, 0)).toBe('$1,234.00');
    expect(formatPayoutAmount(0, 8000)).toBe('~$80.00');
    expect(formatPayoutAmount(123400, 8000)).toBe('$1,234.00 + ~$80.00');
  });
});

describe("buildPayoutCells estimates use each session's rate", () => {
  it('keeps an earlier day at the rate it was tracked at after the task rate changes', () => {
    // Two hours tracked at $40; the task now pays $75
    const session = makeSession({ hourlyRate: 40, timerInstances: [makeInstance()] });
    const [cell] = buildPayoutCells([], [session], [makeTask({ hourlyRate: 75 })], 7, NOW_MS);
    expect(cell.estimatedCents).toBe(8000);
  });

  it('falls back to the task rate for sessions without one', () => {
    const session = makeSession({ timerInstances: [makeInstance()] });
    const [cell] = buildPayoutCells([], [session], [makeTask({ hourlyRate: 75 })], 7, NOW_MS);
    expect(cell.estimatedCents).toBe(15000);
  });

  it('adds sessions at different rates on the same day', () => {
    const morning = makeSession({ id: 's-am', hourlyRate: 40, timerInstances: [makeInstance({ id: 'am' })] });
    const evening = makeSession({
      id: 's-pm',
      hourlyRate: 50,
      timerInstances: [
        makeInstance({
          id: 'pm',
          startTime: new Date(2026, 7, 26, 18, 0).toISOString(),
          endTime: new Date(2026, 7, 26, 19, 0).toISOString(),
          duration: 3_600_000,
        }),
      ],
    });
    const [cell] = buildPayoutCells([], [morning, evening], [makeTask()], 7, NOW_MS);
    expect(cell.estimatedCents).toBe(8000 + 5000);
  });
});

describe('summarizePayouts', () => {
  const today = dayStr(2026, 8, 31);
  const row = (releaseDay: string, actualCents: number, estimatedCents = 0): ReleaseScheduleRow => ({
    releaseDay,
    releaseMs: 0,
    actualCents,
    estimatedCents,
  });

  it("counts untransferred money as available, and released money that isn't as overdue", () => {
    const summary = summarizePayouts(
      [
        makeCell({ actualCents: 1000, untransferredCents: 1000, releaseDay: dayStr(2026, 8, 30) }),
        makeCell({ actualCents: 2000, untransferredCents: 2000, releaseDay: today }),
        makeCell({ actualCents: 4000, releaseDay: dayStr(2026, 9, 1) }),
        makeCell({ actualCents: 5000, paidCents: 5000, releaseDay: dayStr(2026, 8, 20) }),
        makeCell({ actualCents: 30000, releaseDay: dayStr(2026, 8, 20) }),
        // Released an hour ago, by its exact time; and one released in an hour
        makeCell({ actualCents: 700, releaseDay: today, releaseIso: new Date(NOW_MS - 3_600_000).toISOString() }),
        makeCell({ actualCents: 900, releaseDay: today, releaseIso: new Date(NOW_MS + 3_600_000).toISOString() }),
      ],
      today,
      [],
      NOW_MS
    );
    expect(summary.availableCents).toBe(3000);
    expect(summary.overduePendingCents).toBe(30700);
  });

  it('takes what is pending and released next from the schedule', () => {
    const summary = summarizePayouts([], today, [
      row(dayStr(2026, 9, 1), 18750),
      row(dayStr(2026, 9, 1), 1000, 250),
      row(dayStr(2026, 9, 2), 15000, 5000),
    ]);
    expect(summary).toMatchObject({
      pendingCents: 34750,
      estimatedCents: 5250,
      nextReleaseDay: dayStr(2026, 9, 1),
      nextReleaseCents: 20000,
    });
  });

  it('handles an empty ledger', () => {
    expect(summarizePayouts([], today, [])).toEqual({
      availableCents: 0,
      pendingCents: 0,
      estimatedCents: 0,
      nextReleaseDay: null,
      nextReleaseCents: 0,
      overduePendingCents: 0,
    });
  });
});

describe('buildReleaseEvents', () => {
  it('has one event per imported entry with money and one per estimate, soonest first', () => {
    const tracked = makeSession({ timerInstances: [makeInstance()] });
    const cells = buildPayoutCells([], [tracked], [makeTask()], 7, NOW_MS);
    const late = makeEntry({ id: 'late', createdAt: '2026-08-27T23:00:00.000Z', status: 'Paid' });
    const early = makeEntry({ id: 'early', createdAt: '2026-08-25T14:30:00.000Z', amountCents: 2500 });
    const unstamped = makeEntry({ id: 'unstamped', createdAt: '2026-08-25T15:00:00.000Z', updatedAt: 'never' });
    const nothing = makeEntry({ id: 'nothing', amountCents: 0 });

    const events = buildReleaseEvents(cells, [late, nothing, unstamped, early], 7);

    expect(events.map(e => [e.releaseIso, e.actualCents, e.estimatedCents, e.status])).toEqual([
      ['2026-09-01T14:30:00.000Z', 2500, 0, 'Pending Approval'],
      ['2026-09-01T15:00:00.000Z', 30000, 0, 'Pending Approval'],
      [cells[0].releaseIso, 0, 15000, undefined],
      ['2026-09-03T23:00:00.000Z', 30000, 0, 'Paid'],
    ]);
    expect(events[0]).toMatchObject({
      taskId: 'task-1',
      taskName: 'Raccoon - SWE',
      workDay: dayStr(2026, 8, 26),
      reportedMs: Date.parse('2026-08-31T00:00:00Z'),
    });
    expect(events[1].reportedMs).toBeUndefined();
    expect(events[2].workDay).toBe(cells[0].workDay);
    expect(events[2].reportedMs).toBeUndefined();
  });
});

describe('buildReleaseSchedule', () => {
  it('lists pending imports by release time, leaving out paid, available, empty and released ones', () => {
    const e1 = makeEntry({ id: 'e1', createdAt: '2026-08-25T14:30:00.000Z', amountCents: 2500 });
    const e2 = makeEntry({ id: 'e2', createdAt: '2026-08-25T18:00:00.000Z', amountCents: 4000 });
    const sameTime = makeEntry({ id: 'e3', createdAt: '2026-08-25T18:00:00.000Z', amountCents: 1000 });
    const skipped = [
      makeEntry({ id: 'paid', createdAt: '2026-08-25T10:00:00.000Z', status: 'Paid' }),
      makeEntry({ id: 'available', createdAt: '2026-08-25T11:00:00.000Z', status: 'Untransferred' }),
      makeEntry({ id: 'nothing', createdAt: '2026-08-25T12:00:00.000Z', amountCents: 0 }),
      makeEntry({ id: 'released', createdAt: '2026-08-20T12:00:00.000Z', workDay: dayStr(2026, 8, 20) }),
    ];

    const rows = buildReleaseSchedule(buildReleaseEvents([], [e2, e1, sameTime, ...skipped], 7), NOW_MS);

    // Both release on 9/1, at their own times
    expect(rows.map(r => [r.releaseDay, r.releaseIso, r.actualCents])).toEqual([
      [dayStr(2026, 9, 1), '2026-09-01T14:30:00.000Z', 2500],
      [dayStr(2026, 9, 1), '2026-09-01T18:00:00.000Z', 5000],
    ]);
    expect(rows[0].releaseTime).not.toBe(rows[1].releaseTime);
  });

  it('puts an import with an odd report time at the start of its release day', () => {
    const odd = makeEntry({ id: 'odd', createdAt: 'not a date', amountCents: 300 });
    const timed = makeEntry({ id: 'timed', createdAt: '2026-08-26T20:00:00.000Z', amountCents: 700 });
    const rows = buildReleaseSchedule(buildReleaseEvents([], [timed, odd], 7), NOW_MS);
    expect(rows.map(r => [r.releaseDay, r.releaseTime, r.actualCents])).toEqual([
      [dayStr(2026, 9, 2), undefined, 300],
      [dayStr(2026, 9, 2), rows[1].releaseTime, 700],
    ]);
    expect(rows[1].releaseTime).toBeDefined();
  });

  it('adds the estimates still to come, beside imports released at the same time', () => {
    const tracked = makeSession({ timerInstances: [makeInstance()] });
    const old = makeSession({
      id: 'old',
      date: dayStr(2026, 8, 10),
      timerInstances: [
        makeInstance({
          id: 'old',
          startTime: new Date(2026, 7, 10, 10, 0).toISOString(),
          endTime: new Date(2026, 7, 10, 12, 0).toISOString(),
        }),
      ],
    });
    const cells = buildPayoutCells([], [tracked, old], [makeTask()], 7, NOW_MS);
    const sameRelease = makeEntry({
      id: 'same',
      taskId: 'task-2',
      createdAt: new Date(2026, 7, 26, 12, 0).toISOString(),
      amountCents: 100,
    });

    const rows = buildReleaseSchedule(
      buildReleaseEvents([...cells, makeCell({ actualCents: 999 })], [sameRelease], 7),
      NOW_MS
    );
    expect(rows).toEqual([
      expect.objectContaining({ releaseDay: dayStr(2026, 9, 2), actualCents: 100, estimatedCents: 15000 }),
    ]);
  });
});

describe('centsToDollars', () => {
  it('converts integer cents to float dollars', () => {
    expect(centsToDollars(33750)).toBe(337.5);
    expect(centsToDollars(0)).toBe(0);
  });

  it('formats cents as money', () => {
    expect(formatCents(123450)).toBe('$1,234.50');
    expect(formatWholeCents(123450)).toBe('$1,235');
  });
});

describe('groupCellsByMonth', () => {
  it("groups rows by work-day month, newest first, with each month's totals", () => {
    const cells = [
      makeCell({ workDay: '2026-10-03', taskId: 'a', trackedMs: 3_600_000, importedMinutes: 60, actualCents: 5000 }),
      makeCell({
        workDay: '2026-09-30',
        taskId: 'a',
        trackedMs: 1_800_000,
        importedMinutes: 0,
        actualCents: 0,
        estimatedCents: 2500,
      }),
      makeCell({ workDay: '2026-10-01', taskId: 'b', trackedMs: 7_200_000, importedMinutes: 90, actualCents: 7500 }),
      makeCell({ workDay: '2026-09-02', taskId: 'b', trackedMs: 0, importedMinutes: 30, actualCents: 1000 }),
    ];

    const groups = groupCellsByMonth(cells);

    expect(groups.map(g => g.month)).toEqual(['2026-10', '2026-09']);
    expect(groups[0]).toMatchObject({
      trackedMs: 3 * 3_600_000,
      importedMinutes: 150,
      actualCents: 12500,
      estimatedCents: 0,
    });
    expect(groups[0].cells.map(c => c.workDay)).toEqual(['2026-10-03', '2026-10-01']);
    expect(groups[1]).toMatchObject({
      trackedMs: 1_800_000,
      importedMinutes: 30,
      actualCents: 1000,
      estimatedCents: 2500,
    });
  });

  it('is empty without rows', () => {
    expect(groupCellsByMonth([])).toEqual([]);
  });
});
