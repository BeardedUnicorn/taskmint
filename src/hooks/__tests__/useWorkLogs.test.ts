/**
 * Tests for useWorkLogs hook: ledger loading, import application, and error
 * surfacing.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useWorkLogs } from '../useWorkLogs';
import { WorkLogImportPayload, WorkLogImportSummary } from '../../types/workLog';
import {
  createMockProjectTaskMapping,
  createMockWorkLogEntry,
} from '../../__tests__/setup/session-test-utils';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

const mockShowError = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: vi.fn(),
  }),
}));

const emptyResponse = { entries: [], mappings: [], loadWarning: null };

const emptySummary: WorkLogImportSummary = {
  entriesAdded: 0,
  entriesUpdated: 0,
  mappingsSaved: 0,
  groupsApplied: [],
  groupsSkipped: [],
};

const emptyPayload: WorkLogImportPayload = {
  entries: [],
  mappings: [],
  rewriteGroups: [],
};

describe('useWorkLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_work_logs') return emptyResponse;
      return undefined;
    });
  });

  it('loads entries and mappings on mount', async () => {
    const entry = createMockWorkLogEntry();
    const mapping = createMockProjectTaskMapping();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_work_logs') {
        return { entries: [entry], mappings: [mapping], loadWarning: null };
      }
      return undefined;
    });

    const { result } = renderHook(() => useWorkLogs());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([entry]);
    expect(result.current.mappings).toEqual([mapping]);
    expect(result.current.error).toBeNull();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('surfaces the backend error string when loading fails', async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_work_logs') throw 'Failed to lock work logs: poisoned';
      return undefined;
    });

    const { result } = renderHook(() => useWorkLogs());

    await waitFor(() =>
      expect(result.current.error).toBe('Failed to lock work logs: poisoned')
    );
    expect(mockShowError).toHaveBeenCalledWith('Failed to lock work logs: poisoned');
  });

  it('shows a startup load warning once', async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_work_logs') {
        return { ...emptyResponse, loadWarning: '2 records skipped' };
      }
      return undefined;
    });

    const { result } = renderHook(() => useWorkLogs());

    await waitFor(() => expect(result.current.loadWarning).toBe('2 records skipped'));
    await act(async () => {
      await result.current.reload();
    });
    expect(mockShowError).toHaveBeenCalledTimes(1);
    expect(mockShowError).toHaveBeenCalledWith('2 records skipped');
  });

  it('applies an import with the payload and reloads the ledger', async () => {
    const summary: WorkLogImportSummary = { ...emptySummary, entriesAdded: 3 };
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_work_logs') return emptyResponse;
      if (command === 'apply_work_log_import') return summary;
      return undefined;
    });

    const { result } = renderHook(() => useWorkLogs());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockInvoke.mockClear();

    let returned: WorkLogImportSummary | null = null;
    await act(async () => {
      returned = await result.current.applyImport(emptyPayload);
    });

    expect(returned).toEqual(summary);
    expect(mockInvoke).toHaveBeenCalledWith('apply_work_log_import', {
      payload: emptyPayload,
    });
    expect(mockInvoke).toHaveBeenCalledWith('get_work_logs');
  });

  it('returns null and toasts when the apply fails', async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_work_logs') return emptyResponse;
      if (command === 'apply_work_log_import') throw 'replacement session id already exists';
      return undefined;
    });

    const { result } = renderHook(() => useWorkLogs());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returned: WorkLogImportSummary | null = emptySummary;
    await act(async () => {
      returned = await result.current.applyImport(emptyPayload);
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('replacement session id already exists');
    expect(mockShowError).toHaveBeenCalledWith('replacement session id already exists');
  });
});
