import { describe, it, expect, vi } from 'vitest';
import { applyImpliedRates, payloadProjects, planWorkLogImport } from '../plan';
import { parseWorkLogPayload } from '../parse';
import { Task } from '../../../types/task';
import { ProjectTaskMapping } from '../../../types/workLog';

const NOW_ISO = '2026-10-14T12:00:00.000Z';

function timedEntry(id: string, project: { id: string; name: string }, minutes = 60, cents = 3000) {
  return {
    type: 'TimedWorkEntry',
    id,
    createdAt: new Date(2026, 9, 13, 18, 0).toISOString(),
    timeInMinutes: minutes,
    reportedTimeInMinutes: null,
    status: 'Pending Approval',
    amountInCents: cents,
    project: { ...project, hasHourlyPrice: true },
  };
}

const codeReview = { id: 'p-code', name: 'Code Review' };
const newProject = { id: 'p-new', name: 'Brand New' };

// A referral bonus: a work log with money but no project.
const referral = {
  type: 'ReferralWorkLog',
  id: 'ref-1',
  amountInCents: 10000,
  createdAt: new Date(2026, 9, 13, 18, 0).toISOString(),
  status: 'Pending Approval',
};

const tasks: Task[] = [
  { id: 'task-code', name: 'Code Review', hourlyRate: 25, createdAt: '', updatedAt: '' },
  { id: 'task-other', name: 'Other', hourlyRate: 40, createdAt: '', updatedAt: '' },
];

const parse = (timedWorkEntries: unknown[], workLogs: unknown[] = []) =>
  parseWorkLogPayload(JSON.stringify({ timedWorkEntries, workLogs }));

const context = { entries: [], mappings: [], tasks, sessions: [], nowIso: NOW_ISO };

describe('planWorkLogImport', () => {
  it('passes a parse error through', () => {
    expect(planWorkLogImport(parseWorkLogPayload('not json'), context)).toEqual({
      status: 'error',
      error: 'Not valid JSON',
    });
  });

  it('has nothing to do for a payload with no records', () => {
    expect(planWorkLogImport(parse([]), context)).toEqual({ status: 'empty' });
  });

  it('asks for a task for a referral bonus like any unmatched project', () => {
    const plan = planWorkLogImport(parse([], [referral]), context);

    expect(plan.status).toBe('needs-mapping');
    if (plan.status !== 'needs-mapping') return;
    expect(plan.unresolved).toEqual([{ projectId: 'site-type:ReferralWorkLog', projectName: 'Referral bonus' }]);
  });

  it('books a referral bonus to a same-named task without touching sessions or rates', () => {
    const withReferrals = [...tasks, { id: 'task-ref', name: 'Referral bonus', createdAt: '', updatedAt: '' }];
    const plan = planWorkLogImport(parse([], [referral]), { ...context, tasks: withReferrals });

    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.payload.entries).toEqual([
      expect.objectContaining({ id: 'ref-1', kind: 'workLog', taskId: 'task-ref', amountCents: 10000 }),
    ]);
    expect(plan.payload.mappings).toEqual([
      expect.objectContaining({ projectId: 'site-type:ReferralWorkLog', taskId: 'task-ref' }),
    ]);
    expect(plan.payload.rewriteGroups).toEqual([]);
    expect(plan.impliedRates).toEqual([]);
  });

  it('matches projects to same-named tasks and is ready to apply', () => {
    const plan = planWorkLogImport(parse([timedEntry('e1', codeReview, 60, 3000)]), context);

    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.payload.entries.map(e => [e.id, e.taskId])).toEqual([['e1', 'task-code']]);
    expect(plan.payload.mappings).toEqual([expect.objectContaining({ projectId: 'p-code', taskId: 'task-code' })]);
    expect(plan.payload.rewriteGroups).toHaveLength(1);
    expect(plan.impliedRates).toEqual([expect.objectContaining({ taskId: 'task-code', impliedHourlyRate: 30 })]);
    expect(plan.unmatched).toEqual([]);
  });

  it('asks for a task for a project it cannot match, previewing the rest', () => {
    const plan = planWorkLogImport(parse([timedEntry('e1', codeReview), timedEntry('e2', newProject)]), context);

    expect(plan.status).toBe('needs-mapping');
    if (plan.status !== 'needs-mapping') return;
    expect(plan.unresolved).toEqual([{ projectId: 'p-new', projectName: 'Brand New' }]);
    expect(plan.unmatched).toEqual(plan.unresolved);
    expect(plan.entries.map(e => e.id)).toEqual(['e1']);
  });

  it('uses the task chosen for an unmatched project', () => {
    const chosen: ProjectTaskMapping = {
      projectId: 'p-new',
      projectName: 'Brand New',
      taskId: 'task-other',
      taskName: 'Other',
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    };
    const plan = planWorkLogImport(parse([timedEntry('e2', newProject)]), { ...context, chosenMappings: [chosen] });

    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.payload.entries[0].taskId).toBe('task-other');
    // Still listed as needing a choice, so the dialog keeps its picker
    expect(plan.unmatched).toEqual([{ projectId: 'p-new', projectName: 'Brand New' }]);
  });

  it('ignores a choice for a project that already has a mapping', () => {
    const stray: ProjectTaskMapping = {
      projectId: 'p-code',
      projectName: 'Code Review',
      taskId: 'task-other',
      taskName: 'Other',
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    };
    const plan = planWorkLogImport(parse([timedEntry('e1', codeReview)]), { ...context, chosenMappings: [stray] });
    expect(plan.status === 'ready' && plan.payload.entries[0].taskId).toBe('task-code');
  });
});

describe('payloadProjects', () => {
  it('lists each project once', () => {
    const parsed = parse([timedEntry('a', codeReview), timedEntry('b', codeReview), timedEntry('c', newProject)]);
    expect(payloadProjects(parsed)).toEqual([
      expect.objectContaining({ id: 'p-code' }),
      expect.objectContaining({ id: 'p-new' }),
    ]);
  });

  it('lists a referral bonus under its stand-in project', () => {
    const parsed = parse([timedEntry('a', codeReview)], [referral]);
    expect(payloadProjects(parsed)).toEqual([
      expect.objectContaining({ id: 'p-code' }),
      { id: 'site-type:ReferralWorkLog', name: 'Referral bonus' },
    ]);
  });
});

describe('applyImpliedRates', () => {
  const implied = [
    { taskId: 'task-code', taskName: 'Code Review', impliedHourlyRate: 30, entryCount: 1 },
    { taskId: 'task-other', taskName: 'Other', impliedHourlyRate: 40, entryCount: 1 },
    { taskId: 'gone', taskName: 'Gone', impliedHourlyRate: 10, entryCount: 1 },
  ];

  it('changes only the rates that differ, for tasks that exist', async () => {
    const updateTask = vi.fn(async () => null);
    expect(await applyImpliedRates(tasks, implied, updateTask)).toBe(1);
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledWith('task-code', { hourlyRate: 30 });
  });

  it('skips a rate it could not save', async () => {
    const updateTask = vi.fn(async () => Promise.reject(new Error('disk full')));
    expect(await applyImpliedRates(tasks, implied, updateTask)).toBe(0);
  });
});
