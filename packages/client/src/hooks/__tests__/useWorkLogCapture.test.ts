/**
 * Tests for useWorkLogCapture: auto-apply, staging, dedupe/retry, and
 * event-driven processing of extension-delivered payloads.
 *
 * The fake backend's emit() stands in for the backend's
 * work-log-payload-captured event.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useWorkLogCapture, UseWorkLogCaptureDeps, WORK_LOG_CAPTURED_EVENT } from '../useWorkLogCapture';
import { deriveTimedWorkDay } from '../../utils/workLogImport';
import { CaptureSource, PendingWorkLogCapture, WorkLogImportSummary } from '../../types/workLog';
import { createMockTask } from '../../__tests__/setup/session-test-utils';

import { fakeBackend } from '../../testing';
const mockInvoke = fakeBackend().call;

const notifications = vi.hoisted(() => ({ notify: vi.fn(), showWarning: vi.fn() }));
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => notifications,
}));
const mockNotify = notifications.notify;
const mockShowWarning = notifications.showWarning;

/** The notify() calls of one severity. */
function notified(severity: string) {
  return mockNotify.mock.calls.map(([options]) => options).filter(options => options.severity === severity);
}

const CREATED_AT = '2026-08-26T20:00:00.000Z';
const WORK_DAY = deriveTimedWorkDay(CREATED_AT, 240);

const samplePayloadText = JSON.stringify({
  workLogs: [],
  timedWorkEntries: [
    {
      type: 'TimedWorkEntry',
      id: 'entry-1',
      createdAt: CREATED_AT,
      timeInMinutes: 240,
      reportedTimeInMinutes: null,
      status: 'Pending Approval',
      amountInCents: 30000,
      project: { id: 'proj-1', name: 'Raccoon - SWE', hasHourlyPrice: true },
    },
  ],
});

function capture(payload: string, source: CaptureSource = 'extension'): PendingWorkLogCapture {
  return { payload, receivedAt: '2026-08-31T12:00:00.000Z', source };
}

const appliedSummary: WorkLogImportSummary = {
  entriesAdded: 1,
  entriesUpdated: 0,
  mappingsSaved: 1,
  groupsApplied: [
    { taskId: 'task-1', workDay: WORK_DAY, deletedInstances: 0, sessionId: 'session_x' },
  ],
  groupsSkipped: [],
};

// Command-keyed queues for take_pending_work_log_capture; unprimed → null.
let takeQueue: Array<PendingWorkLogCapture | null | undefined>;

function makeDeps(overrides: Partial<UseWorkLogCaptureDeps> = {}): UseWorkLogCaptureDeps {
  return {
    entries: [],
    mappings: [],
    applyImport: vi.fn(async () => appliedSummary),
    sessions: [],
    tasks: [createMockTask({ id: 'task-1', name: 'Raccoon - SWE', hourlyRate: 50 })],
    updateTask: vi.fn(async () => null),
    stagedCapture: null,
    stageCapture: vi.fn(),
    clearStagedCapture: vi.fn(),
    ...overrides,
  };
}

async function fireCaptureEvent() {
  await act(async () => {
    fakeBackend().emit(WORK_LOG_CAPTURED_EVENT, { receivedAt: 'now' });
    // Let the async processing settle.
    await Promise.resolve();
  });
}

describe('useWorkLogCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    takeQueue = [];
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'take_pending_work_log_capture') {
        return takeQueue.length > 0 ? takeQueue.shift() : null;
      }
      return undefined;
    });
  });

  it('auto-applies a fully mapped payload on mount and syncs the task rate', async () => {
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps();

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() => expect(deps.applyImport).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(deps.applyImport).mock.calls[0][0];
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]).toMatchObject({
      id: 'entry-1',
      taskId: 'task-1',
      workDay: WORK_DAY,
      amountCents: 30000,
    });
    expect(payload.mappings).toEqual([
      expect.objectContaining({ projectId: 'proj-1', taskId: 'task-1' }),
    ]);
    expect(payload.rewriteGroups).toHaveLength(1);
    expect(payload.rewriteGroups[0]).toMatchObject({ taskId: 'task-1', workDay: WORK_DAY });

    // 30000¢ over 240min ⇒ $75/hr, task currently $50.
    await waitFor(() =>
      expect(deps.updateTask).toHaveBeenCalledWith('task-1', { hourlyRate: 75 })
    );
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith({
        category: 'workLog',
        severity: 'success',
        title: 'Work logs imported',
        message: '1 new, 0 updated, 1 day rewritten · rates updated for 1 task.',
        actions: [{ label: 'View in Payouts', view: 'payouts' }],
      })
    );
    expect(deps.stageCapture).not.toHaveBeenCalled();
    expect(notified('error')).toHaveLength(0);
  });

  it('leaves the rate alone when it already matches', async () => {
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps({
      tasks: [createMockTask({ id: 'task-1', name: 'Raccoon - SWE', hourlyRate: 75 })],
    });

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() => expect(notified('success')).toHaveLength(1));
    expect(deps.updateTask).not.toHaveBeenCalled();
    expect(notified('success')[0].message).toBe('1 new, 0 updated, 1 day rewritten.');
  });

  it('still reports the import when a rate update fails', async () => {
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps({ updateTask: vi.fn(async () => Promise.reject(new Error('disk full'))) });

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() => expect(notified('success')).toHaveLength(1));
    expect(notified('success')[0].message).toBe('1 new, 0 updated, 1 day rewritten.');
    expect(notified('error')).toHaveLength(0);
  });

  it('stages the capture when a project has no task match', async () => {
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps({
      tasks: [createMockTask({ id: 'other', name: 'Unrelated Task' })],
    });

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() =>
      expect(deps.stageCapture).toHaveBeenCalledWith({
        payloadText: samplePayloadText,
        receivedAt: '2026-08-31T12:00:00.000Z',
        reason: 'unmapped-project',
      })
    );
    expect(notified('info')).toEqual([
      expect.objectContaining({
        category: 'workLog',
        title: 'Work logs to review',
        message: expect.stringContaining('needs a task match'),
        actions: [{ label: 'Review in Payouts', view: 'payouts' }],
      }),
    ]);
    expect(deps.applyImport).not.toHaveBeenCalled();
  });

  it('stages a taskmint:// link payload for review instead of applying it', async () => {
    takeQueue.push(capture(samplePayloadText, 'link'));
    const deps = makeDeps();

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() =>
      expect(deps.stageCapture).toHaveBeenCalledWith({
        payloadText: samplePayloadText,
        receivedAt: '2026-08-31T12:00:00.000Z',
        reason: 'unverified-link',
      })
    );
    expect(notified('info')).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('taskmint:// link'),
        actions: [{ label: 'Review in Payouts', view: 'payouts' }],
      }),
    ]);
    expect(deps.applyImport).not.toHaveBeenCalled();
  });

  it("applies a link-staged payload once the extension's trusted delivery confirms it", async () => {
    takeQueue.push(capture(samplePayloadText, 'link'));
    const deps = makeDeps();
    const { rerender } = renderHook(props => useWorkLogCapture(props), { initialProps: deps });
    await waitFor(() => expect(deps.stageCapture).toHaveBeenCalledTimes(1));

    // The context now holds the staged copy; the extension's POST arrives.
    const staged = vi.mocked(deps.stageCapture).mock.calls[0][0];
    const withStaged = { ...deps, stagedCapture: staged };
    rerender(withStaged);
    takeQueue.push(capture(samplePayloadText, 'extension'));
    await fireCaptureEvent();

    await waitFor(() => expect(deps.applyImport).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(deps.clearStagedCapture).toHaveBeenCalledTimes(1));
  });

  it('does not re-stage an identical link payload, nor stage one already applied', async () => {
    takeQueue.push(capture(samplePayloadText, 'extension'));
    const deps = makeDeps();
    renderHook(() => useWorkLogCapture(deps));
    await waitFor(() => expect(deps.applyImport).toHaveBeenCalledTimes(1));

    takeQueue.push(capture(samplePayloadText, 'link'));
    await fireCaptureEvent();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2)); // second take happened

    expect(deps.stageCapture).not.toHaveBeenCalled();
    expect(deps.applyImport).toHaveBeenCalledTimes(1);
  });

  it('reports an unreadable payload without applying anything', async () => {
    takeQueue.push(capture('not json'));
    const deps = makeDeps();

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() =>
      expect(notified('error')).toEqual([
        expect.objectContaining({ category: 'workLog', title: "Couldn't read captured work logs" }),
      ])
    );
    expect(deps.applyImport).not.toHaveBeenCalled();
    expect(deps.stageCapture).not.toHaveBeenCalled();
  });

  it('skips an identical re-delivered payload', async () => {
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps();

    renderHook(() => useWorkLogCapture(deps));
    await waitFor(() => expect(deps.applyImport).toHaveBeenCalledTimes(1));

    takeQueue.push(capture(samplePayloadText));
    await fireCaptureEvent();

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
    expect(deps.applyImport).toHaveBeenCalledTimes(1);
    expect(notified('success')).toHaveLength(1);
  });

  it('lets an identical payload retry after a failed apply', async () => {
    const applyImport = vi
      .fn<(p: unknown) => Promise<WorkLogImportSummary | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(appliedSummary);
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps({ applyImport: applyImport as UseWorkLogCaptureDeps['applyImport'] });

    renderHook(() => useWorkLogCapture(deps));
    await waitFor(() => expect(applyImport).toHaveBeenCalledTimes(1));
    expect(notified('success')).toHaveLength(0);

    takeQueue.push(capture(samplePayloadText));
    await fireCaptureEvent();

    await waitFor(() => expect(applyImport).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(notified('success')).toHaveLength(1));
  });

  it('processes payloads that arrive via the captured event', async () => {
    const deps = makeDeps();
    renderHook(() => useWorkLogCapture(deps));

    // Mount take found nothing.
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(deps.applyImport).not.toHaveBeenCalled();

    takeQueue.push(capture(samplePayloadText));
    await fireCaptureEvent();

    await waitFor(() => expect(deps.applyImport).toHaveBeenCalledTimes(1));
  });

  it('surfaces every skipped day from the apply summary', async () => {
    const summary: WorkLogImportSummary = {
      ...appliedSummary,
      groupsSkipped: [
        {
          taskId: 'task-1',
          workDay: WORK_DAY,
          reason: 'a timer is running or paused; stop it first, then re-import',
        },
      ],
    };
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps({ applyImport: vi.fn(async () => summary) });

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() =>
      expect(mockShowWarning).toHaveBeenCalledWith(expect.stringContaining('stop it first'), {
        category: 'workLog',
        desktop: 'never',
      })
    );
  });

  it('treats an undefined take result as a no-op', async () => {
    takeQueue.push(undefined);
    const deps = makeDeps();

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(deps.applyImport).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('reports a failure while processing, with a way to Payouts', async () => {
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps({ applyImport: vi.fn(async () => Promise.reject(new Error('locked'))) });

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() =>
      expect(notified('error')).toEqual([
        expect.objectContaining({
          category: 'workLog',
          title: "Couldn't import captured work logs",
          message: 'locked',
          actions: [{ label: 'View in Payouts', view: 'payouts' }],
        }),
      ])
    );
  });
});
