/**
 * Work-log reconciliation types: the pasted site payload, the persisted
 * imported ledger (worklogs.json, Rust-side), and the wire shapes of the
 * get_work_logs / apply_work_log_import commands.
 */

import { z } from 'zod';
import type * as Wire from '@taskmint/contracts';
import type { ProjectTaskMapping, WorkLogEntry } from '@taskmint/contracts';

/** Provenance marker on sessions synthesized by a work-log import. */
export { WORKLOG_IMPORT_SOURCE } from '@taskmint/contracts';

// ============================================================================
// SITE PAYLOAD (pasted JSON)
// ============================================================================
// zod v4 objects strip unknown keys by default, which gives the required
// tolerance for the site's extra fields (type, hasHourlyPrice, isDeleted,
// hasUnpaidWorkLogs, requiresAdminApproval, editableBySurger, taskIdShort, …).
// Work logs are the exception for `type`: some (referral bonuses) carry money
// but no project, and their type stands in for one.

export const SiteProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type SiteProject = z.infer<typeof SiteProjectSchema>;

/** Names for the project-less work-log types; others show their raw type. */
const UNASSIGNED_WORK_LOG_NAMES: Record<string, string> = {
  ReferralWorkLog: 'Referral bonus',
};

/**
 * The stand-in project for a work log that has none (a referral bonus), keyed
 * by the site's record type so its task mapping is stored and reused like any
 * project's. The `site-type:` prefix keeps it clear of the site's uuid ids.
 */
export function unassignedWorkLogProject(type: string): SiteProject {
  return { id: `site-type:${type}`, name: UNASSIGNED_WORK_LOG_NAMES[type] ?? type };
}

export const SiteTimedWorkEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  timeInMinutes: z.number().min(0),
  reportedTimeInMinutes: z.number().min(0).nullable().optional(),
  status: z.string().default(''),
  amountInCents: z.number(),
  project: SiteProjectSchema,
});
export type SiteTimedWorkEntry = z.infer<typeof SiteTimedWorkEntrySchema>;

export const SiteWorkLogSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().optional(),
    createdAt: z.iso.datetime({ offset: true }),
    status: z.string().default(''),
    amountInCents: z.number(),
    project: SiteProjectSchema.optional(),
  })
  .refine(log => log.project !== undefined || Boolean(log.type?.trim()), {
    message: 'A work log needs a project or a type',
    path: ['project'],
  })
  .transform(({ type, project, ...log }) => ({
    ...log,
    // The refine guarantees a type whenever the project is missing.
    project: project ?? unassignedWorkLogProject(type!.trim()),
  }));
export type SiteWorkLog = z.infer<typeof SiteWorkLogSchema>;

// ============================================================================
// PERSISTED LEDGER (the backend's WorkLogEntry / ProjectTaskMapping)
// ============================================================================

export type { WorkLogEntry, ProjectTaskMapping } from '@taskmint/contracts';

// ============================================================================
// COMMAND WIRE SHAPES
// ============================================================================

/**
 * One (task, workDay) rewrite the frontend asks the backend to apply: delete
 * the listed finalized instances of that task's bucket and insert the
 * replacement session synthesized from the ledger.
 */
export interface RewriteGroup {
  taskId: string;
  workDay: string;
  deleteInstanceIds: string[];
  /** Running/paused instances found in the bucket; their presence skips the group. */
  blockingInstanceIds: string[];
  /** Null when a remap leaves the day nothing to import for this task: the group only removes. */
  replacementSession: Wire.TaskSession | null;
}

export interface WorkLogImportPayload {
  entries: WorkLogEntry[];
  mappings: ProjectTaskMapping[];
  rewriteGroups: RewriteGroup[];
  /** A project moved to another task: entries keep their last-import time. */
  isRemap?: boolean;
}

export type { WorkLogImportSummary } from '@taskmint/contracts';

/**
 * How a capture reached the app. 'extension': localhost POST from the pinned
 * TaskMint extension — trusted. 'link': a taskmint:// link, which any web
 * page can open — review first. A pending capture is
 * take_pending_work_log_capture's reply.
 */
export type { CaptureSource, PendingCapture as PendingWorkLogCapture } from '@taskmint/contracts';
