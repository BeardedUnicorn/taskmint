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
  buildReleaseSchedule,
  centsToDollars,
  summarizePayouts,
  PayoutDayCell,
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
    startTime: new Date(2026, 7, 26, 10, 0),
    endTime: new Date(2026, 7, 26, 12, 0),
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

  it('sorts newest day first', () => {
    const older = makeEntry({ id: 'old', workDay: dayStr(2026, 8, 20) });
    const cells = buildPayoutCells([older, makeEntry()], [], [], 7, NOW_MS);
    expect(cells.map(c => c.workDay)).toEqual([dayStr(2026, 8, 26), dayStr(2026, 8, 20)]);
  });
});

describe('summarizePayouts', () => {
  const today = dayStr(2026, 8, 31);

  it('only includes untransferred cents in available, excluding paid and pending', () => {
    const summary = summarizePayouts(
      [
        makeCell({ actualCents: 1000, untransferredCents: 1000, releaseDay: dayStr(2026, 8, 30) }),
        makeCell({ actualCents: 2000, untransferredCents: 2000, releaseDay: today }),
        makeCell({ actualCents: 4000, releaseDay: dayStr(2026, 9, 1) }),
        makeCell({ actualCents: 5000, paidCents: 5000, releaseDay: dayStr(2026, 8, 20) }),
      ],
      today
    );
    expect(summary.availableCents).toBe(3000);
    expect(summary.pendingCents).toBe(4000);
    expect(summary.nextReleaseDay).toBe(dayStr(2026, 9, 1));
    expect(summary.nextReleaseCents).toBe(4000);
  });

  it('totals estimates separately and includes them in the next release', () => {
    const summary = summarizePayouts(
      [
        makeCell({ estimatedCents: 1500, releaseDay: dayStr(2026, 9, 3), isEstimate: true }),
        makeCell({ actualCents: 4000, releaseDay: dayStr(2026, 9, 3) }),
      ],
      today
    );
    expect(summary.estimatedCents).toBe(1500);
    expect(summary.pendingCents).toBe(4000);
    expect(summary.nextReleaseCents).toBe(5500);
  });

  it('handles an empty ledger', () => {
    const summary = summarizePayouts([], today);
    expect(summary).toEqual({
      availableCents: 0,
      pendingCents: 0,
      estimatedCents: 0,
      nextReleaseDay: null,
      nextReleaseCents: 0,
      overduePendingCents: 0,
    });
  });

  it('aligns pendingCents and next release with schedule when schedule is provided', () => {
    const schedule = [
      {
        releaseDay: dayStr(2026, 9, 1),
        releaseTime: '8:22 PM',
        releaseIso: '2026-09-02T02:22:00.000Z',
        actualCents: 18750,
        estimatedCents: 0,
      },
      {
        releaseDay: dayStr(2026, 9, 2),
        releaseTime: '1:47 AM',
        releaseIso: '2026-09-02T07:47:00.000Z',
        actualCents: 15000,
        estimatedCents: 5000,
      },
    ];

    const summary = summarizePayouts([], today, schedule);
    expect(summary.pendingCents).toBe(33750);
    expect(summary.estimatedCents).toBe(5000);
    expect(summary.nextReleaseDay).toBe(dayStr(2026, 9, 1));
    expect(summary.nextReleaseCents).toBe(18750);
  });

  it('excludes past estimates from estimatedCents in fallback mode', () => {
    const pastEstimateCell = makeCell({
      estimatedCents: 15000,
      releaseDay: dayStr(2026, 8, 20),
      isEstimate: true,
    });
    const futureEstimateCell = makeCell({
      estimatedCents: 8000,
      releaseDay: dayStr(2026, 9, 5),
      isEstimate: true,
    });

    const summary = summarizePayouts([pastEstimateCell, futureEstimateCell], today);
    expect(summary.estimatedCents).toBe(8000);
  });

  it('computes overduePendingCents for pending entries whose release date has passed', () => {
    const pastPendingCell = makeCell({
      actualCents: 30000,
      untransferredCents: 0,
      paidCents: 0,
      releaseDay: dayStr(2026, 8, 20),
    });

    const summary = summarizePayouts([pastPendingCell], today);
    expect(summary.overduePendingCents).toBe(30000);
    expect(summary.pendingCents).toBe(0);
  });
});

describe('buildReleaseSchedule', () => {
  it('groups future releases by day, ascending when using cells fallback', () => {
    const today = dayStr(2026, 8, 31);
    const rows = buildReleaseSchedule(
      [
        makeCell({ actualCents: 1000, releaseDay: dayStr(2026, 9, 2) }),
        makeCell({ estimatedCents: 500, releaseDay: dayStr(2026, 9, 2) }),
        makeCell({ actualCents: 3000, releaseDay: dayStr(2026, 9, 1) }),
        makeCell({ actualCents: 9000, releaseDay: today }), // already released
        makeCell({ releaseDay: dayStr(2026, 9, 5) }), // empty cell dropped
      ],
      today
    );
    expect(rows).toEqual([
      { releaseDay: dayStr(2026, 9, 1), releaseTime: undefined, releaseIso: undefined, actualCents: 3000, estimatedCents: 0 },
      { releaseDay: dayStr(2026, 9, 2), releaseTime: undefined, releaseIso: undefined, actualCents: 1000, estimatedCents: 500 },
    ]);
  });

  it('includes release time and does not group on date for entries with different times', () => {
    const today = dayStr(2026, 8, 31);
    const e1 = makeEntry({
      id: 'e1',
      createdAt: '2026-08-25T14:30:00.000Z',
      amountCents: 2500,
      status: 'Pending Approval',
    });
    const e2 = makeEntry({
      id: 'e2',
      createdAt: '2026-08-25T18:00:00.000Z',
      amountCents: 4000,
      status: 'Pending Approval',
    });
    const paid = makeEntry({
      id: 'e-paid',
      createdAt: '2026-08-25T10:00:00.000Z',
      amountCents: 10000,
      status: 'Paid',
    });
    const untransferred = makeEntry({
      id: 'e-untransferred',
      createdAt: '2026-08-25T11:00:00.000Z',
      amountCents: 5000,
      status: 'Untransferred',
    });

    const rows = buildReleaseSchedule([], today, [e1, e2, paid, untransferred], 7, NOW_MS);

    // Both e1 and e2 release 7 days after 8/25 = 9/01, but they are NOT grouped on date
    expect(rows).toHaveLength(2);
    expect(rows[0].releaseDay).toBe(dayStr(2026, 9, 1));
    expect(rows[0].releaseTime).toBeDefined();
    expect(rows[0].actualCents).toBe(2500);

    expect(rows[1].releaseDay).toBe(dayStr(2026, 9, 1));
    expect(rows[1].releaseTime).toBeDefined();
    expect(rows[1].actualCents).toBe(4000);
    expect(rows[0].releaseTime).not.toBe(rows[1].releaseTime);
  });
});

describe('centsToDollars', () => {
  it('converts integer cents to float dollars', () => {
    expect(centsToDollars(33750)).toBe(337.5);
    expect(centsToDollars(0)).toBe(0);
  });
});
