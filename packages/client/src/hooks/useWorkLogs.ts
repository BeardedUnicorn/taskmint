/**
 * Work-Log Ledger Hook
 *
 * Loads the imported work-log ledger and project→task mappings from the Rust
 * store (worklogs.json) and applies imports. Session state is deliberately
 * NOT read here — consumers take sessions from SessionManagementProvider,
 * which refreshes itself via the backend's `work-logs-imported` event after
 * an apply. The ledger reloads on that event too, so an import or restore
 * made in another tab or device shows here.
 *
 * Intended for a single consumer: WorkLogProvider (src/contexts/
 * WorkLogContext.tsx). Pages read the shared instance via useWorkLogContext.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { getBackend, useBackendEvent } from '../backend';
import { BACKEND_EVENTS } from '../constants/events';
import {
  ProjectTaskMapping,
  WorkLogEntry,
  WorkLogImportPayload,
  WorkLogImportSummary,
} from '../types/workLog';
import { useNotification } from '../contexts/NotificationContext';
import { errorMessage } from '../utils/errors';

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

  const { showError, showWarning } = useNotification();

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getBackend().call('get_work_logs');
      setEntries(response.entries ?? []);
      setMappings(response.mappings ?? []);
      setLoadWarning(response.loadWarning ?? null);
    } catch (err) {
      const message = errorMessage(err, 'Failed to load work logs');
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
        const summary = await getBackend().call('apply_work_log_import', { payload });
        await reload();
        return summary;
      } catch (err) {
        const message = errorMessage(err, 'Failed to apply work-log import');
        setError(message);
        showError(message);
        return null;
      }
    },
    [reload, showError]
  );

  // Changed elsewhere (or this tab's own import, already shown): read it again
  useBackendEvent([BACKEND_EVENTS.WORK_LOGS_IMPORTED, BACKEND_EVENTS.RESYNC], () => {
    getBackend()
      .call('get_work_logs')
      .then(
        response => {
          setEntries(response.entries);
          setMappings(response.mappings);
        },
        err => console.error('Failed to reload work logs:', err)
      );
  });

  // Surface a startup load problem (skipped/unreadable worklogs.json records)
  // once per mount.
  const loadWarningShownRef = useRef(false);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (loadWarning && !loadWarningShownRef.current) {
      loadWarningShownRef.current = true;
      showWarning(loadWarning, {
        category: 'workLog',
        title: 'Some work logs could not be read',
        duration: null,
      });
    }
  }, [loadWarning, showWarning]);

  return useMemo(
    () => ({ entries, mappings, isLoading, error, loadWarning, reload, applyImport }),
    [entries, mappings, isLoading, error, loadWarning, reload, applyImport]
  );
}
