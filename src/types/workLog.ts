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

export const SiteProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

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

export const SiteWorkLogSchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  status: z.string().default(''),
  amountInCents: z.number(),
  project: SiteProjectSchema,
});
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
  replacementSession: TaskSession;
}

export interface WorkLogImportPayload {
  entries: WorkLogEntry[];
  mappings: ProjectTaskMapping[];
  rewriteGroups: RewriteGroup[];
}

export interface AppliedGroup {
  taskId: string;
  workDay: string;
  deletedInstances: number;
  sessionId: string;
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
