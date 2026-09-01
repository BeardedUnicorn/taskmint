/**
 * Tests for useWorkLogCapture: auto-apply, staging, dedupe/retry, and
 * event-driven processing of extension-delivered payloads.
 *
 * Unlike other hook tests, these capture the Tauri listen() callback and
 * invoke it directly to simulate the backend's work-log-payload-captured
 * event.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useWorkLogCapture, UseWorkLogCaptureDeps, WORK_LOG_CAPTURED_EVENT } from '../useWorkLogCapture';
import { deriveTimedWorkDay } from '../../utils/workLogImport';
import { PendingWorkLogCapture, WorkLogImportSummary } from '../../types/workLog';
import { createMockTask } from '../../__tests__/setup/session-test-utils';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockShowWarning = vi.fn();
const mockShowInfo = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showWarning: mockShowWarning,
    showInfo: mockShowInfo,
  }),
}));

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

function capture(payload: string): PendingWorkLogCapture {
  return { payload, receivedAt: '2026-08-31T12:00:00.000Z' };
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
let eventHandlers: Record<string, (event: { payload: unknown }) => void>;

function makeDeps(overrides: Partial<UseWorkLogCaptureDeps> = {}): UseWorkLogCaptureDeps {
  return {
    entries: [],
    mappings: [],
    applyImport: vi.fn(async () => appliedSummary),
    sessions: [],
    tasks: [createMockTask({ id: 'task-1', name: 'Raccoon - SWE', hourlyRate: 50 })],
    updateTask: vi.fn(async () => null),
    stageCapture: vi.fn(),
    ...overrides,
  };
}

async function fireCaptureEvent() {
  await act(async () => {
    eventHandlers[WORK_LOG_CAPTURED_EVENT]?.({ payload: { receivedAt: 'now' } });
    // Let the async processing settle.
    await Promise.resolve();
  });
}

describe('useWorkLogCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    takeQueue = [];
    eventHandlers = {};
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'take_pending_work_log_capture') {
        return takeQueue.length > 0 ? takeQueue.shift() : null;
      }
      return undefined;
    });
    mockListen.mockImplementation(async (event: string, handler: never) => {
      eventHandlers[event] = handler;
      return () => {
        delete eventHandlers[event];
      };
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

    expect(mockShowSuccess).toHaveBeenCalledWith(
      expect.stringContaining('1 new, 0 updated, 1 day rewritten')
    );
    // 30000¢ over 240min ⇒ $75/hr, task currently $50.
    await waitFor(() =>
      expect(deps.updateTask).toHaveBeenCalledWith('task-1', { hourlyRate: 75 })
    );
    expect(deps.stageCapture).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('leaves the rate alone when it already matches', async () => {
    takeQueue.push(capture(samplePayloadText));
    const deps = makeDeps({
      tasks: [createMockTask({ id: 'task-1', name: 'Raccoon - SWE', hourlyRate: 75 })],
    });

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() => expect(deps.applyImport).toHaveBeenCalledTimes(1));
    expect(deps.updateTask).not.toHaveBeenCalled();
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
      })
    );
    expect(mockShowInfo).toHaveBeenCalledWith(expect.stringContaining('Review in Payouts'));
    expect(deps.applyImport).not.toHaveBeenCalled();
  });

  it('reports an unreadable payload without applying anything', async () => {
    takeQueue.push(capture('not json'));
    const deps = makeDeps();

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith(expect.stringContaining('could not be read'))
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
    expect(mockShowSuccess).toHaveBeenCalledTimes(1);
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
    expect(mockShowSuccess).not.toHaveBeenCalled();

    takeQueue.push(capture(samplePayloadText));
    await fireCaptureEvent();

    await waitFor(() => expect(applyImport).toHaveBeenCalledTimes(2));
    expect(mockShowSuccess).toHaveBeenCalledTimes(1);
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
      expect(mockShowWarning).toHaveBeenCalledWith(expect.stringContaining('stop it first'))
    );
  });

  it('treats an undefined take result as a no-op', async () => {
    takeQueue.push(undefined);
    const deps = makeDeps();

    renderHook(() => useWorkLogCapture(deps));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(deps.applyImport).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });
});
