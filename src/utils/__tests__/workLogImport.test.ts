/**
 * Work-log import helper tests.
 *
 * Instants are constructed from LOCAL wall times (new Date(y, m, d, …)) so
 * the day-attribution assertions hold in any host timezone, per the
 * timezone.test.ts convention.
 */

import { describe, expect, it } from 'vitest';
import { Task } from '../../types/task';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { ProjectTaskMapping, WORKLOG_IMPORT_SOURCE, WorkLogEntry } from '../../types/workLog';
import {
  buildImportPreview,
  buildLedgerEntries,
  buildRewriteGroups,
  buildSynthesizedSession,
  computeImpliedRates,
  deriveTimedWorkDay,
  deriveWorkLogWorkDay,
  effectiveMinutes,
  mergeLedger,
  parseWorkLogPayload,
  resolveProjectMappings,
} from '../workLogImport';

/** ISO instant for a LOCAL wall time. */
function localIso(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayStr(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

const NOW_ISO = '2026-08-31T12:00:00.000Z';

// A trimmed copy of the real site payload, extra fields included.
const SAMPLE_PAYLOAD = {
  workLogs: [
    {
      type: 'TaskResponseWorkLog',
      id: 'c793ef2e-41e5-4222-a1ab-741a86c3da0a',
      amountInCents: 0,
      createdAt: '2026-08-27T05:09:25.472Z',
      status: 'Untransferred',
      project: {
        isDeleted: false,
        id: '8be5970c-ba16-43a7-bcd8-ca224a050790',
        name: '[Quick Survey] Do you have subscriptions?',
        hasHourlyPrice: false,
      },
    },
  ],
  timedWorkEntries: [
    {
      type: 'TimedWorkEntry',
      id: 'd5fecd1f-218f-47e9-a93d-bfa321e0ea7d',
      createdAt: '2026-08-30T00:00:36.244Z',
      timeInMinutes: 270,
      reportedTimeInMinutes: null,
      taskIdShort: null,
      status: 'Pending Approval',
      amountInCents: 33750,
      editableBySurger: true,
      project: {
        isDeleted: false,
        id: 'a8d57886-9d6e-46a8-aac2-26f3649aa2d6',
        name: 'Raccoon - SWE',
        hasHourlyPrice: true,
      },
      hasUnpaidWorkLogs: true,
      requiresAdminApproval: false,
    },
    {
      type: 'TimedWorkEntry',
      id: '66c858d0-ba1e-4d49-873e-3f126adbea12',
      createdAt: '2026-08-26T05:10:35.505Z',
      timeInMinutes: 30,
      reportedTimeInMinutes: null,
      taskIdShort: null,
      status: 'Pending Approval',
      amountInCents: 3750,
      editableBySurger: true,
      project: {
        isDeleted: false,
        id: 'a8d57886-9d6e-46a8-aac2-26f3649aa2d6',
        name: 'Raccoon - SWE',
        hasHourlyPrice: true,
      },
      hasUnpaidWorkLogs: true,
      requiresAdminApproval: false,
    },
  ],
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Raccoon - SWE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Task;
}

function makeMapping(overrides: Partial<ProjectTaskMapping> = {}): ProjectTaskMapping {
  return {
    projectId: 'proj-1',
    projectName: 'Raccoon - SWE',
    taskId: 'task-1',
    taskName: 'Raccoon - SWE',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

function makeTimedEntry(overrides: Partial<WorkLogEntry> & { createdAt: string }): WorkLogEntry {
  const base: WorkLogEntry = {
    id: 'entry-1',
    kind: 'timed',
    createdAt: overrides.createdAt,
    workDay: '',
    projectId: 'proj-1',
    projectName: 'Raccoon - SWE',
    taskId: 'task-1',
    taskName: 'Raccoon - SWE',
    timeInMinutes: 60,
    reportedTimeInMinutes: null,
    amountCents: 7500,
    status: 'Pending Approval',
    importedAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
  const entry = { ...base, ...overrides };
  if (!entry.workDay) {
    entry.workDay = deriveTimedWorkDay(entry.createdAt, effectiveMinutes(entry));
  }
  return entry;
}

function makeInstance(overrides: Partial<TimerInstance> = {}): TimerInstance {
  return {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date(2026, 7, 26, 10, 0),
    endTime: new Date(2026, 7, 26, 11, 0),
    duration: 3_600_000,
    state: TimerState.stopped,
    isRunning: false,
    isPaused: false,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
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
    date: '2026-08-26',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

describe('parseWorkLogPayload', () => {
  it('parses the real site payload shape, stripping unknown fields', () => {
    const result = parseWorkLogPayload(JSON.stringify(SAMPLE_PAYLOAD));
    expect(result.error).toBeNull();
    expect(result.skippedRecords).toBe(0);
    expect(result.timedEntries).toHaveLength(2);
    expect(result.workLogs).toHaveLength(1);
    expect(result.timedEntries[0].project.name).toBe('Raccoon - SWE');
    expect('taskIdShort' in result.timedEntries[0]).toBe(false);
  });

  it('reports invalid JSON as a fatal error', () => {
    expect(parseWorkLogPayload('{nope').error).toBe('Not valid JSON');
    expect(parseWorkLogPayload('[1,2,3]').error).toMatch(/Expected a JSON object/);
  });

  it('skips corrupt records without failing the paste', () => {
    const payload = {
      timedWorkEntries: [
        SAMPLE_PAYLOAD.timedWorkEntries[0],
        { id: 'broken', createdAt: 'not-a-date' },
      ],
    };
    const result = parseWorkLogPayload(JSON.stringify(payload));
    expect(result.error).toBeNull();
    expect(result.timedEntries).toHaveLength(1);
    expect(result.skippedRecords).toBe(1);
    expect(result.workLogs).toHaveLength(0);
  });

  it('treats a non-array collection as fatal', () => {
    const result = parseWorkLogPayload(JSON.stringify({ timedWorkEntries: {} }));
    expect(result.error).toMatch(/must be arrays/);
  });

  it('accepts an empty object as an empty payload', () => {
    const result = parseWorkLogPayload('{}');
    expect(result.error).toBeNull();
    expect(result.timedEntries).toHaveLength(0);
    expect(result.workLogs).toHaveLength(0);
  });
});

describe('effectiveMinutes', () => {
  it('prefers reportedTimeInMinutes, including a real zero', () => {
    expect(effectiveMinutes({ timeInMinutes: 270, reportedTimeInMinutes: null })).toBe(270);
    expect(effectiveMinutes({ timeInMinutes: 270, reportedTimeInMinutes: 240 })).toBe(240);
    expect(effectiveMinutes({ timeInMinutes: 270, reportedTimeInMinutes: 0 })).toBe(0);
    expect(effectiveMinutes({})).toBe(0);
  });
});

describe('work day derivation', () => {
  it('attributes an entry to the local day the work started', () => {
    // Created locally at 14:00 for 60 minutes: started 13:00 same local day.
    expect(deriveTimedWorkDay(localIso(2026, 8, 26, 14, 0), 60)).toBe(dayStr(2026, 8, 26));
  });

  it('crosses local midnight backwards when the work started yesterday', () => {
    // Created just after local midnight for 270 minutes of work.
    expect(deriveTimedWorkDay(localIso(2026, 8, 30, 0, 30), 270)).toBe(dayStr(2026, 8, 29));
  });

  it('uses the createdAt day for zero-minute entries and workLogs', () => {
    expect(deriveTimedWorkDay(localIso(2026, 8, 27, 0, 5), 0)).toBe(dayStr(2026, 8, 27));
    expect(deriveWorkLogWorkDay(localIso(2026, 8, 27, 0, 5))).toBe(dayStr(2026, 8, 27));
  });
});

describe('resolveProjectMappings', () => {
  const projects = [{ id: 'proj-1', name: 'Raccoon - SWE' }];

  it('prefers a stored mapping whose task still exists', () => {
    const other = makeTask({ id: 'task-2', name: 'Something Else' });
    const result = resolveProjectMappings(
      projects,
      [makeMapping({ taskId: 'task-2', taskName: 'Old Name' })],
      [makeTask(), other],
      NOW_ISO
    );
    expect(result.unresolved).toHaveLength(0);
    expect(result.resolved[0].taskId).toBe('task-2');
    expect(result.resolved[0].taskName).toBe('Something Else');
  });

  it('re-prompts when the mapped task was deleted', () => {
    const result = resolveProjectMappings(
      [{ id: 'proj-ghost', name: 'No Match Here' }],
      [makeMapping({ projectId: 'proj-ghost', taskId: 'task-gone' })],
      [makeTask()],
      NOW_ISO
    );
    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toEqual([{ projectId: 'proj-ghost', projectName: 'No Match Here' }]);
  });

  it('auto-matches by trimmed case-insensitive task name', () => {
    const result = resolveProjectMappings(
      [{ id: 'proj-1', name: '  raccoon - swe ' }],
      [],
      [makeTask({ name: 'Raccoon - SWE' })],
      NOW_ISO
    );
    expect(result.unresolved).toHaveLength(0);
    expect(result.resolved[0]).toMatchObject({ projectId: 'proj-1', taskId: 'task-1' });
  });

  it('lists an unmatched project once even when repeated', () => {
    const result = resolveProjectMappings(
      [
        { id: 'proj-x', name: 'Unknown' },
        { id: 'proj-x', name: 'Unknown' },
      ],
      [],
      [makeTask()],
      NOW_ISO
    );
    expect(result.unresolved).toHaveLength(1);
  });
});

describe('buildLedgerEntries', () => {
  it('builds timed and workLog ledger entries with derived work days', () => {
    const parsed = parseWorkLogPayload(JSON.stringify(SAMPLE_PAYLOAD));
    const mappings = [
      makeMapping({ projectId: 'a8d57886-9d6e-46a8-aac2-26f3649aa2d6' }),
      makeMapping({
        projectId: '8be5970c-ba16-43a7-bcd8-ca224a050790',
        projectName: '[Quick Survey] Do you have subscriptions?',
        taskId: 'task-survey',
        taskName: 'Surveys',
      }),
    ];
    const entries = buildLedgerEntries(parsed, mappings, NOW_ISO);

    expect(entries).toHaveLength(3);
    const timed = entries.find(e => e.id === 'd5fecd1f-218f-47e9-a93d-bfa321e0ea7d')!;
    expect(timed.kind).toBe('timed');
    expect(timed.taskId).toBe('task-1');
    expect(timed.amountCents).toBe(33750);
    expect(timed.workDay).toBe(deriveTimedWorkDay(timed.createdAt, 270));

    const workLog = entries.find(e => e.kind === 'workLog')!;
    expect(workLog.taskId).toBe('task-survey');
    expect(workLog.timeInMinutes).toBeNull();
  });

  it('omits entries whose project has no mapping', () => {
    const parsed = parseWorkLogPayload(JSON.stringify(SAMPLE_PAYLOAD));
    const entries = buildLedgerEntries(parsed, [], NOW_ISO);
    expect(entries).toHaveLength(0);
  });
});

describe('mergeLedger', () => {
  it('adds new entries and updates existing ones, preserving importedAt', () => {
    const original = makeTimedEntry({ createdAt: localIso(2026, 8, 26, 14), importedAt: 'FIRST' });
    const revision = makeTimedEntry({
      createdAt: localIso(2026, 8, 26, 14),
      amountCents: 9999,
      importedAt: 'SECOND',
    });
    const fresh = makeTimedEntry({ id: 'entry-2', createdAt: localIso(2026, 8, 27, 14) });

    const { merged, added, updated } = mergeLedger([original], [revision, fresh]);
    expect(added).toBe(1);
    expect(updated).toBe(1);
    expect(merged).toHaveLength(2);
    expect(merged[0].amountCents).toBe(9999);
    expect(merged[0].importedAt).toBe('FIRST');
  });
});

describe('buildSynthesizedSession', () => {
  it('creates one finalized instance per entry, honoring the duration invariant', () => {
    let n = 0;
    const idFactory = () => `uuid-${n++}`;
    const late = makeTimedEntry({ id: 'late', createdAt: localIso(2026, 8, 26, 23), timeInMinutes: 30 });
    const early = makeTimedEntry({ id: 'early', createdAt: localIso(2026, 8, 26, 9), timeInMinutes: 95 });

    const session = buildSynthesizedSession(
      'task-1',
      'Raccoon - SWE',
      early.workDay,
      [late, early],
      NOW_ISO,
      idFactory
    );

    expect(session.id).toBe('session_uuid-0');
    expect(session.source).toBe(WORKLOG_IMPORT_SOURCE);
    expect(session.isActive).toBe(false);
    expect(session.date).toBe(early.workDay);
    expect(session.timerInstances).toHaveLength(2);
    // Sorted by reconstructed start: "early" first.
    expect(session.timerInstances[0].externalId).toBe('early');
    expect(session.timerInstances[1].externalId).toBe('late');
    expect(session.totalDuration).toBe((95 + 30) * 60_000);

    for (const instance of session.timerInstances) {
      expect(instance.id).toMatch(/^instance_uuid-/);
      expect(instance.sessionId).toBe(session.id);
      expect(instance.state).toBe(TimerState.stopped);
      const start = new Date(instance.startTime).getTime();
      const end = new Date(instance.endTime as Date).getTime();
      expect(end - start).toBe(instance.duration);
    }
  });
});

describe('buildRewriteGroups', () => {
  const createdAt = localIso(2026, 8, 26, 14, 0);
  const pasteEntry = makeTimedEntry({ id: 'paste-1', createdAt, timeInMinutes: 240 });
  const workDay = pasteEntry.workDay;

  it('deletes the day bucket and rebuilds it from the merged ledger', () => {
    // Another ledger entry for the same day that was NOT in this paste.
    const priorEntry = makeTimedEntry({
      id: 'prior-1',
      createdAt: localIso(2026, 8, 26, 9, 0),
      timeInMinutes: 30,
    });
    const tracked = makeInstance({
      id: 'tracked-1',
      startTime: new Date(2026, 7, 26, 10, 0),
    });
    const otherDay = makeInstance({
      id: 'tracked-other-day',
      startTime: new Date(2026, 7, 20, 10, 0),
    });
    const sessions = [makeSession({ timerInstances: [tracked, otherDay] })];

    const result = buildRewriteGroups([pasteEntry], [pasteEntry, priorEntry], sessions, {
      nowIso: NOW_ISO,
      idFactory: () => 'fixed',
    });

    expect(result.groups).toHaveLength(1);
    const group = result.groups[0];
    expect(group.taskId).toBe('task-1');
    expect(group.workDay).toBe(workDay);
    expect(group.deleteInstanceIds).toEqual(['tracked-1']);
    expect(group.blockingInstanceIds).toEqual([]);
    // Replacement contains BOTH ledger entries for the day.
    expect(group.replacementSession.timerInstances).toHaveLength(2);
    expect(result.blockedDays).toHaveLength(0);
    expect(result.noopDays).toBe(0);
  });

  it('only rewrites days present in the paste', () => {
    const otherDayLedger = makeTimedEntry({
      id: 'old-day',
      createdAt: localIso(2026, 8, 20, 14, 0),
      timeInMinutes: 60,
    });
    const result = buildRewriteGroups([pasteEntry], [pasteEntry, otherDayLedger], [], {
      nowIso: NOW_ISO,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].workDay).toBe(workDay);
  });

  it('flags buckets holding a running or paused timer', () => {
    const running = makeInstance({
      id: 'running-1',
      startTime: new Date(2026, 7, 26, 13, 0),
      state: TimerState.running,
      isRunning: true,
      endTime: undefined,
      duration: undefined,
    });
    const sessions = [makeSession({ timerInstances: [running], isActive: true })];

    const result = buildRewriteGroups([pasteEntry], [pasteEntry], sessions, { nowIso: NOW_ISO });
    expect(result.blockedDays).toEqual([
      { taskId: 'task-1', taskName: 'Raccoon - SWE', workDay },
    ]);
    expect(result.groups[0].blockingInstanceIds).toEqual(['running-1']);
    expect(result.groups[0].deleteInstanceIds).toEqual([]);
  });

  it('skips days that already match the ledger (idempotent re-paste)', () => {
    const synthesized = buildSynthesizedSession(
      'task-1',
      'Raccoon - SWE',
      workDay,
      [pasteEntry],
      NOW_ISO,
      () => 'prior'
    );
    const result = buildRewriteGroups([pasteEntry], [pasteEntry], [synthesized], {
      nowIso: NOW_ISO,
    });
    expect(result.groups).toHaveLength(0);
    expect(result.noopDays).toBe(1);
  });

  it('rebuilds a previously imported day whose ledger changed', () => {
    const synthesized = buildSynthesizedSession(
      'task-1',
      'Raccoon - SWE',
      workDay,
      [pasteEntry],
      NOW_ISO,
      () => 'prior'
    );
    const revised = { ...pasteEntry, reportedTimeInMinutes: 200 };
    const result = buildRewriteGroups([revised], [revised], [synthesized], { nowIso: NOW_ISO });
    expect(result.noopDays).toBe(0);
    expect(result.groups).toHaveLength(1);
    // The prior synthesized instances land in the delete set.
    expect(result.groups[0].deleteInstanceIds).toEqual(
      synthesized.timerInstances.map(i => i.id)
    );
  });
});

describe('buildImportPreview', () => {
  it('reports tracked vs imported time with overwrite and block flags', () => {
    const createdAt = localIso(2026, 8, 26, 14, 0);
    const entry = makeTimedEntry({ id: 'p1', createdAt, timeInMinutes: 240 });
    const tracked = makeInstance({
      id: 't1',
      startTime: new Date(2026, 7, 26, 10, 0),
      duration: 3_600_000,
    });
    const sessions = [makeSession({ timerInstances: [tracked] })];

    const rows = buildImportPreview([entry], [entry], sessions, Date.now());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workDay: entry.workDay,
      taskId: 'task-1',
      trackedMs: 3_600_000,
      importedMinutes: 240,
      deltaMinutes: 180,
      amountCents: 7500,
      blocked: false,
      isRemap: false,
    });
  });

  it('marks previously imported days as overwrites', () => {
    const createdAt = localIso(2026, 8, 26, 14, 0);
    const entry = makeTimedEntry({ id: 'p1', createdAt, timeInMinutes: 60 });
    const synthesized = buildSynthesizedSession(
      'task-1',
      'Raccoon - SWE',
      entry.workDay,
      [makeTimedEntry({ id: 'old', createdAt, timeInMinutes: 45 })],
      NOW_ISO,
      () => 'prior'
    );
    const rows = buildImportPreview([entry], [entry], [synthesized], Date.now());
    expect(rows[0].isRemap).toBe(true);
  });
});

describe('computeImpliedRates', () => {
  it('derives the hourly rate from cents and minutes', () => {
    const entries = [
      makeTimedEntry({ id: 'a', createdAt: localIso(2026, 8, 26, 14), timeInMinutes: 270, amountCents: 33750 }),
      makeTimedEntry({ id: 'b', createdAt: localIso(2026, 8, 26, 20), timeInMinutes: 30, amountCents: 3750 }),
    ];
    const rates = computeImpliedRates(entries);
    expect(rates).toEqual([
      { taskId: 'task-1', taskName: 'Raccoon - SWE', impliedHourlyRate: 75, entryCount: 2 },
    ]);
  });

  it('skips zero-minute tasks and clamps to the schema cap', () => {
    const zero = makeTimedEntry({ id: 'z', createdAt: localIso(2026, 8, 26, 14), timeInMinutes: 0 });
    expect(computeImpliedRates([zero])).toHaveLength(0);

    const absurd = makeTimedEntry({
      id: 'x',
      createdAt: localIso(2026, 8, 26, 14),
      timeInMinutes: 1,
      amountCents: 1_000_000,
    });
    expect(computeImpliedRates([absurd])[0].impliedHourlyRate).toBe(1000);
  });
});
