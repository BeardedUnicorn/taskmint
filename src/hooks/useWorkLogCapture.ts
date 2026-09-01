/**
 * Work-Log Capture Handler
 *
 * Reacts to payloads delivered by the browser extension (over localhost or a
 * taskmint:// deep link). The backend stores the latest payload and emits
 * `work-log-payload-captured`; this hook takes it (take semantics — processed
 * at most once) and either auto-applies it through the same pipeline as the
 * import dialog, or stages it for review when a project has no task match.
 *
 * Invoked once, by WorkLogProvider. Dependencies are injected so tests need
 * no context tree.
 */

import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Task } from '../types/task';
import { TaskSession } from '../types/timer';
import {
  PendingWorkLogCapture,
  ProjectTaskMapping,
  WorkLogEntry,
  WorkLogImportPayload,
  WorkLogImportSummary,
} from '../types/workLog';
import {
  buildLedgerEntries,
  buildRewriteGroups,
  computeImpliedRates,
  mergeLedger,
  parseWorkLogPayload,
  resolveProjectMappings,
} from '../utils/workLogImport';
import { useNotification } from '../contexts/NotificationContext';

export const WORK_LOG_CAPTURED_EVENT = 'work-log-payload-captured';

export interface StagedCapture {
  payloadText: string;
  receivedAt: string;
}

export interface UseWorkLogCaptureDeps {
  entries: WorkLogEntry[];
  mappings: ProjectTaskMapping[];
  applyImport: (payload: WorkLogImportPayload) => Promise<WorkLogImportSummary | null>;
  sessions: TaskSession[];
  tasks: Task[];
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<unknown>;
  stageCapture: (capture: StagedCapture) => void;
}

export function useWorkLogCapture(deps: UseWorkLogCaptureDeps): void {
  const { showSuccess, showError, showWarning, showInfo } = useNotification();

  // Latest data without re-registering the listener (useSessionManagement
  // pattern).
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const processingRef = useRef(false);
  const queuedRef = useRef(false);
  const lastProcessedRef = useRef<string | null>(null);

  const processPending = useCallback(async () => {
    // Serialize: an event landing mid-apply is replayed afterwards, so a
    // fresher pending payload is never stranded in the backend.
    if (processingRef.current) {
      queuedRef.current = true;
      return;
    }
    processingRef.current = true;
    try {
      const capture = await invoke<PendingWorkLogCapture | null>(
        'take_pending_work_log_capture'
      );
      if (!capture || typeof capture.payload !== 'string') return;

      // Identical re-deliveries (protocol + confirming POST, extension
      // retries) must not re-apply or re-toast.
      if (capture.payload === lastProcessedRef.current) return;
      lastProcessedRef.current = capture.payload;

      const d = depsRef.current;
      const parsed = parseWorkLogPayload(capture.payload);
      if (parsed.error) {
        showError(`Captured work-log payload could not be read: ${parsed.error}`);
        return;
      }
      if (parsed.skippedRecords > 0) {
        showWarning(
          `${parsed.skippedRecords} captured record${
            parsed.skippedRecords === 1 ? '' : 's'
          } could not be read and will be skipped.`
        );
      }
      if (parsed.timedEntries.length === 0 && parsed.workLogs.length === 0) return;

      // Distinct projects, same derivation as the import dialog.
      const projectsById = new Map<string, { id: string; name: string }>();
      for (const record of [...parsed.timedEntries, ...parsed.workLogs]) {
        projectsById.set(record.project.id, record.project);
      }
      const nowIso = new Date().toISOString();
      const resolution = resolveProjectMappings(
        [...projectsById.values()],
        d.mappings,
        d.tasks,
        nowIso
      );

      if (resolution.unresolved.length > 0) {
        d.stageCapture({ payloadText: capture.payload, receivedAt: capture.receivedAt });
        showInfo(
          'Work logs captured from DataAnnotation — a new project needs a task match. Review in Payouts.'
        );
        return;
      }

      // Auto-apply: the import dialog's exact sequence.
      const pasteLedger = buildLedgerEntries(parsed, resolution.resolved, nowIso);
      if (pasteLedger.length === 0) return;
      const { merged } = mergeLedger(d.entries, pasteLedger);
      const groupBuild = buildRewriteGroups(pasteLedger, merged, d.sessions, { nowIso });
      const summary = await d.applyImport({
        entries: pasteLedger,
        mappings: resolution.resolved,
        rewriteGroups: groupBuild.groups,
      });
      if (!summary) {
        // applyImport already toasted; allow an identical re-delivery to
        // retry after what may have been a transient failure.
        lastProcessedRef.current = null;
        return;
      }

      showSuccess(
        `Work logs imported from DataAnnotation: ${summary.entriesAdded} new, ` +
          `${summary.entriesUpdated} updated, ${summary.groupsApplied.length} day` +
          `${summary.groupsApplied.length === 1 ? '' : 's'} rewritten.`
      );
      for (const skipped of summary.groupsSkipped) {
        showWarning(`${skipped.workDay}: ${skipped.reason}`);
      }

      // Keep task rates aligned with real pay (the dialog's default-on
      // checkbox, fixed on for automatic imports).
      for (const implied of computeImpliedRates(pasteLedger)) {
        const task = d.tasks.find(t => t.id === implied.taskId);
        if (task && task.hourlyRate !== implied.impliedHourlyRate) {
          await d.updateTask(implied.taskId, { hourlyRate: implied.impliedHourlyRate });
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' && err.trim() ? err : '';
      showError(
        `Failed to process captured work logs${message ? `: ${message}` : ''}`
      );
    } finally {
      processingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void processPending();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showError, showInfo, showSuccess, showWarning]);

  useEffect(() => {
    // A payload may have arrived before the frontend mounted (deep-link cold
    // start) — the take-on-mount call and the event handler share one path.
    void processPending();
    const unlistenPromise = listen(WORK_LOG_CAPTURED_EVENT, () => {
      void processPending();
    });
    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };
  }, [processPending]);
}
