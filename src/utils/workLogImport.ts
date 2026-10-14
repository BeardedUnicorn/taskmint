/**
 * Work-log import: the pure functions behind the paste dialog, browser
 * capture and project remapping, split by stage under utils/workLog/.
 *
 * Day attribution matches the app's session bucketing (timerHelpers): time
 * belongs to the local calendar day the work STARTED. A timed entry's start is
 * reconstructed as createdAt − effectiveMinutes, on the assumption that the
 * site entry was created when the work was reported, right after finishing.
 */

export { parseWorkLogPayload } from './workLog/parse';
export type { ParsedSitePayload } from './workLog/parse';
export { effectiveMinutes, deriveTimedWorkDay, deriveWorkLogWorkDay } from './workLog/days';
export { resolveProjectMappings } from './workLog/mappings';
export type { MappingResolution } from './workLog/mappings';
export { buildLedgerEntries, mergeLedger } from './workLog/ledger';
export { buildSynthesizedSession, instanceBelongsToWorkDay, buildRewriteGroups } from './workLog/rewrite';
export type { RewriteGroupBuildResult } from './workLog/rewrite';
export { buildRemapPlan } from './workLog/remap';
export type { RemapPlan } from './workLog/remap';
export { buildImportPreview } from './workLog/preview';
export type { ImportPreviewRow } from './workLog/preview';
export { computeImpliedRates } from './workLog/rates';
export type { ImpliedTaskRate } from './workLog/rates';
export { planWorkLogImport, applyImpliedRates, payloadProjects } from './workLog/plan';
export type { ImportContext, WorkLogImportPlan } from './workLog/plan';
