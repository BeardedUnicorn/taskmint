/**
 * Work-Log Capture Handler
 *
 * Reacts to payloads delivered by the browser extension (over localhost or a
 * taskmint:// deep link). The backend stores the latest payload and emits
 * `work-log-payload-captured`; this hook takes it (take semantics — processed
 * at most once) and either auto-applies it through the same pipeline as the
 * import dialog (planWorkLogImport), or stages it for review in Payouts. Staged: anything that
 * arrived by taskmint:// link (any web page can open one, and an import
 * rewrites tracked days), and payloads with a project that has no task match.
 *
 * Captures usually land while you're in the browser, so each outcome is
 * also a desktop notification when the app window isn't focused.
 *
 * Invoked once, by WorkLogProvider. Dependencies are injected so tests need
 * no context tree.
 */

import { useCallback, useEffect, useRef } from 'react';
import { getBackend, useBackendEvent } from '../backend';
import { BACKEND_EVENTS } from '../constants/events';
import { Task } from '../types/task';
import { TaskSession } from '../types/timer';
import {
  ProjectTaskMapping,
  WorkLogEntry,
  WorkLogImportPayload,
  WorkLogImportSummary,
} from '../types/workLog';
import { applyImpliedRates, parseWorkLogPayload, planWorkLogImport } from '../utils/workLogImport';
import { useNotification, NotificationAction } from '../contexts/NotificationContext';
import { errorMessage } from '../utils/errors';

// Captures arrive while you're in the browser, so they also reach the OS when
// TaskMint isn't in front (the workLog category's route).
const REVIEW_IN_PAYOUTS: NotificationAction[] = [{ label: 'Review in Payouts', view: 'payouts' }];
const VIEW_IN_PAYOUTS: NotificationAction[] = [{ label: 'View in Payouts', view: 'payouts' }];

export const WORK_LOG_CAPTURED_EVENT = BACKEND_EVENTS.WORK_LOG_PAYLOAD_CAPTURED;

export type StagedCaptureReason = 'unmapped-project' | 'unverified-link';

export interface StagedCapture {
  payloadText: string;
  receivedAt: string;
  reason: StagedCaptureReason;
}

// 'staged-link': only staged because it came by link — the extension's
// trusted delivery of the same payload may still apply it.
type ProcessedOutcome = 'handled' | 'staged-link';

export interface UseWorkLogCaptureDeps {
  entries: WorkLogEntry[];
  mappings: ProjectTaskMapping[];
  applyImport: (payload: WorkLogImportPayload) => Promise<WorkLogImportSummary | null>;
  sessions: TaskSession[];
  tasks: Task[];
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<unknown>;
  stagedCapture: StagedCapture | null;
  stageCapture: (capture: StagedCapture) => void;
  clearStagedCapture: () => void;
}

export function useWorkLogCapture(deps: UseWorkLogCaptureDeps): void {
  const { notify, showWarning } = useNotification();

  // Latest data without re-registering the listener (useSessionManagement
  // pattern).
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const processingRef = useRef(false);
  const queuedRef = useRef(false);
  const lastProcessedRef = useRef<{ payload: string; outcome: ProcessedOutcome } | null>(null);

  const processPending = useCallback(async () => {
    // Serialize: an event landing mid-apply is replayed afterwards, so a
    // fresher pending payload is never stranded in the backend.
    if (processingRef.current) {
      queuedRef.current = true;
      return;
    }
    processingRef.current = true;
    try {
      const capture = await getBackend().call('take_pending_work_log_capture');
      if (!capture || typeof capture.payload !== 'string') return;

      // Identical re-deliveries (protocol + confirming POST, extension
      // retries) must not re-apply or re-toast — except that the extension's
      // trusted POST may confirm a payload a taskmint:// link only staged.
      const trusted = capture.source !== 'link';
      const last = lastProcessedRef.current;
      if (
        last &&
        last.payload === capture.payload &&
        !(last.outcome === 'staged-link' && trusted)
      ) {
        return;
      }

      const d = depsRef.current;
      if (!trusted) {
        lastProcessedRef.current = { payload: capture.payload, outcome: 'staged-link' };
        d.stageCapture({
          payloadText: capture.payload,
          receivedAt: capture.receivedAt,
          reason: 'unverified-link',
        });
        notify({
          category: 'workLog',
          severity: 'info',
          title: 'Work logs to review',
          message: 'They arrived through a taskmint:// link. Review them in Payouts before importing.',
          actions: REVIEW_IN_PAYOUTS,
        });
        return;
      }
      lastProcessedRef.current = { payload: capture.payload, outcome: 'handled' };

      const parsed = parseWorkLogPayload(capture.payload);
      if (parsed.skippedRecords > 0) {
        showWarning(
          `${parsed.skippedRecords} captured record${
            parsed.skippedRecords === 1 ? '' : 's'
          } could not be read and will be skipped.`,
          { category: 'workLog', desktop: 'never' }
        );
      }

      const plan = planWorkLogImport(parsed, {
        entries: d.entries,
        mappings: d.mappings,
        tasks: d.tasks,
        sessions: d.sessions,
        nowIso: new Date().toISOString(),
      });
      if (plan.status === 'error') {
        notify({
          category: 'workLog',
          severity: 'error',
          title: "Couldn't read captured work logs",
          message: plan.error,
        });
        return;
      }
      if (plan.status === 'empty') return;
      if (plan.status === 'needs-mapping') {
        d.stageCapture({
          payloadText: capture.payload,
          receivedAt: capture.receivedAt,
          reason: 'unmapped-project',
        });
        notify({
          category: 'workLog',
          severity: 'info',
          title: 'Work logs to review',
          message: 'Captured from DataAnnotation — a new project needs a task match.',
          actions: REVIEW_IN_PAYOUTS,
        });
        return;
      }

      const summary = await d.applyImport(plan.payload);
      if (!summary) {
        // applyImport already toasted; allow an identical re-delivery to
        // retry after what may have been a transient failure.
        lastProcessedRef.current = null;
        return;
      }

      // The same payload may be waiting for review from an earlier link.
      if (d.stagedCapture?.payloadText === capture.payload) {
        d.clearStagedCapture();
      }

      // Keep task rates aligned with real pay (the dialog's default-on
      // checkbox, fixed on for automatic imports).
      const ratesUpdated = await applyImpliedRates(d.tasks, plan.impliedRates, d.updateTask);

      const days = summary.groupsApplied.length;
      const rates =
        ratesUpdated > 0 ? ` · rates updated for ${ratesUpdated} task${ratesUpdated === 1 ? '' : 's'}` : '';
      notify({
        category: 'workLog',
        severity: 'success',
        title: 'Work logs imported',
        message:
          `${summary.entriesAdded} new, ${summary.entriesUpdated} updated, ` +
          `${days} day${days === 1 ? '' : 's'} rewritten${rates}.`,
        actions: VIEW_IN_PAYOUTS,
      });
      for (const skipped of summary.groupsSkipped) {
        showWarning(`${skipped.workDay}: ${skipped.reason}`, { category: 'workLog', desktop: 'never' });
      }
    } catch (err) {
      const message = errorMessage(err, '');
      notify({
        category: 'workLog',
        severity: 'error',
        title: "Couldn't import captured work logs",
        message: message || 'Open Payouts to try again.',
        actions: VIEW_IN_PAYOUTS,
      });
    } finally {
      processingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void processPending();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, showWarning]);

  // A payload may have arrived before the frontend mounted (deep-link cold
  // start) — the take-on-mount call and the event handler share one path.
  useEffect(() => {
    void processPending();
  }, [processPending]);
  // A server's resync: a capture may have arrived while the stream was down
  useBackendEvent([WORK_LOG_CAPTURED_EVENT, BACKEND_EVENTS.RESYNC], () => {
    void processPending();
  });
}
