/**
 * Work-Log Ledger Hook
 *
 * Loads the imported work-log ledger and project→task mappings from the Rust
 * store (worklogs.json) and applies imports. Session state is deliberately
 * NOT read here — consumers take sessions from SessionManagementProvider,
 * which refreshes itself via the backend's `work-logs-imported` event after
 * an apply.
 *
 * Intended for a single consumer: WorkLogProvider (src/contexts/
 * WorkLogContext.tsx). Pages read the shared instance via useWorkLogContext.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ProjectTaskMapping,
  WorkLogEntry,
  WorkLogImportPayload,
  WorkLogImportSummary,
  WorkLogsResponse,
} from '../types/workLog';
import { useNotification } from '../contexts/NotificationContext';

// Tauri rejects Result<_, String> command errors with the plain string, not
// an Error instance (same handling as useSessionManagement).
function errorText(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

export interface UseWorkLogsReturn {
  entries: WorkLogEntry[];
  mappings: ProjectTaskMapping[];
  isLoading: boolean;
  error: string | null;
  loadWarning: string | null;
  reload: () => Promise<void>;
  applyImport: (payload: WorkLogImportPayload) => Promise<WorkLogImportSummary | null>;
}

export function useWorkLogs(): UseWorkLogsReturn {
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const [mappings, setMappings] = useState<ProjectTaskMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const { showError } = useNotification();

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await invoke<WorkLogsResponse>('get_work_logs');
      setEntries(response.entries ?? []);
      setMappings(response.mappings ?? []);
      setLoadWarning(response.loadWarning ?? null);
    } catch (err) {
      const message = errorText(err, 'Failed to load work logs');
      setError(message);
      showError(message);
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  const applyImport = useCallback(
    async (payload: WorkLogImportPayload): Promise<WorkLogImportSummary | null> => {
      setError(null);
      try {
        const summary = await invoke<WorkLogImportSummary>('apply_work_log_import', { payload });
        await reload();
        return summary;
      } catch (err) {
        const message = errorText(err, 'Failed to apply work-log import');
        setError(message);
        showError(message);
        return null;
      }
    },
    [reload, showError]
  );

  // Surface a startup load problem (skipped/unreadable worklogs.json records)
  // once per mount.
  const loadWarningShownRef = useRef(false);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (loadWarning && !loadWarningShownRef.current) {
      loadWarningShownRef.current = true;
      showError(loadWarning);
    }
  }, [loadWarning, showError]);

  return { entries, mappings, isLoading, error, loadWarning, reload, applyImport };
}
