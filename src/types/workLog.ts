/**
 * Work-log reconciliation types: the pasted site payload, the persisted
 * imported ledger (worklogs.json, Rust-side), and the wire shapes of the
 * get_work_logs / apply_work_log_import commands.
 */

import { z } from 'zod';
import { TaskSession } from './timer';

/**
 * Provenance marker on sessions synthesized by a work-log import. Must match
 * WORKLOG_IMPORT_SOURCE in src-tauri/src/commands/worklogs.rs.
 */
export const WORKLOG_IMPORT_SOURCE = 'worklog-import';

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
// PERSISTED LEDGER (mirrors the Rust WorkLogEntry / ProjectTaskMapping)
// ============================================================================

export type WorkLogKind = 'timed' | 'workLog';

export interface WorkLogEntry {
  id: string; // the site's entry uuid; the upsert key
  kind: WorkLogKind;
  createdAt: string; // site's ISO-UTC timestamp, verbatim
  workDay: string; // local YYYY-MM-DD the entry's time/money belongs to
  projectId: string;
  projectName: string;
  taskId: string; // mapped TaskMint task, denormalized at import
  taskName: string;
  timeInMinutes?: number | null; // timed entries only
  reportedTimeInMinutes?: number | null; // timed only; null = not reported
  amountCents: number;
  status: string; // informational only
  importedAt: string; // first-seen ISO, preserved on upsert
  updatedAt: string; // last-upserted ISO
}

export const WorkLogEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['timed', 'workLog']),
  createdAt: z.string(),
  workDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'workDay must be YYYY-MM-DD'),
  projectId: z.string(),
  projectName: z.string(),
  taskId: z.string(),
  taskName: z.string(),
  timeInMinutes: z.number().min(0).nullable().optional(),
  reportedTimeInMinutes: z.number().min(0).nullable().optional(),
  amountCents: z.number().int(),
  status: z.string(),
  importedAt: z.string(),
  updatedAt: z.string(),
});

export interface ProjectTaskMapping {
  projectId: string; // the upsert key
  projectName: string;
  taskId: string;
  taskName: string;
  createdAt: string;
  updatedAt: string;
}

export const ProjectTaskMappingSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string(),
  taskId: z.string(),
  taskName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// COMMAND WIRE SHAPES
// ============================================================================

export interface WorkLogsResponse {
  entries: WorkLogEntry[];
  mappings: ProjectTaskMapping[];
  loadWarning: string | null;
}

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
  replacementSession: TaskSession | null;
}

export interface WorkLogImportPayload {
  entries: WorkLogEntry[];
  mappings: ProjectTaskMapping[];
  rewriteGroups: RewriteGroup[];
  /** A project moved to another task: entries keep their last-import time. */
  isRemap?: boolean;
}

export interface AppliedGroup {
  taskId: string;
  workDay: string;
  deletedInstances: number;
  /** The replacement session; null for a group that only removed time. */
  sessionId: string | null;
}

export interface SkippedGroup {
  taskId: string;
  workDay: string;
  reason: string;
}

export interface WorkLogImportSummary {
  entriesAdded: number;
  entriesUpdated: number;
  mappingsSaved: number;
  groupsApplied: AppliedGroup[];
  groupsSkipped: SkippedGroup[];
}

/** Wire shape of take_pending_work_log_capture (Rust PendingCapture). */
/**
 * How a capture reached the app (CaptureSource in src-tauri/src/types.rs).
 * 'extension': localhost POST from the pinned TaskMint extension — trusted.
 * 'link': a taskmint:// link, which any web page can open — review first.
 */
export type CaptureSource = 'extension' | 'link';

export interface PendingWorkLogCapture {
  payload: string; // raw captured JSON text
  receivedAt: string; // RFC3339
  source: CaptureSource;
}

/** Wire shape of get_capture_server_status. */
export interface CaptureServerStatus {
  running: boolean;
  port: number;
  warning: string | null;
}
