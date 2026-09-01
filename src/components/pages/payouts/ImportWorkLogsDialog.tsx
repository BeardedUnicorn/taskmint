/**
 * Import Work Logs Dialog
 *
 * Paste the payment site's JSON, resolve unmapped projects to tasks, preview
 * the per-day overwrite, then apply. Applying rewrites the covered days'
 * session data (the site's numbers become the record) — the preview calls
 * that out per day before anything is touched.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { WarningAmber as WarningIcon } from '@mui/icons-material';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import {
  ProjectTaskMapping,
  WorkLogEntry,
  WorkLogImportPayload,
  WorkLogImportSummary,
} from '../../../types/workLog';
import {
  buildImportPreview,
  buildLedgerEntries,
  buildRewriteGroups,
  computeImpliedRates,
  mergeLedger,
  parseWorkLogPayload,
  resolveProjectMappings,
} from '../../../utils/workLogImport';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { centsToDollars } from '../../../utils/payoutCalculator';
import { TaskSelector } from '../../ui/forms/TaskSelector';

interface ImportWorkLogsDialogProps {
  open: boolean;
  onClose: () => void;
  existingEntries: WorkLogEntry[];
  existingMappings: ProjectTaskMapping[];
  sessions: TaskSession[];
  tasks: Task[];
  onApply: (payload: WorkLogImportPayload) => Promise<WorkLogImportSummary | null>;
  onCreateTask: (name: string) => Promise<Task>;
  onUpdateTaskRate: (taskId: string, rate: number) => Promise<unknown>;
}

interface TaskChoice {
  name: string;
  task: Task | null;
}

function signedMinutes(deltaMinutes: number): string {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return '±0m';
  return `${rounded > 0 ? '+' : '−'}${formatDuration(Math.abs(rounded) * 60_000)}`;
}

export function ImportWorkLogsDialog({
  open,
  onClose,
  existingEntries,
  existingMappings,
  sessions,
  tasks,
  onApply,
  onCreateTask,
  onUpdateTaskRate,
}: ImportWorkLogsDialogProps) {
  const [rawText, setRawText] = useState('');
  const [taskChoices, setTaskChoices] = useState<Record<string, TaskChoice>>({});
  const [updateRates, setUpdateRates] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<WorkLogImportSummary | null>(null);

  // Fresh dialog on every open.
  useEffect(() => {
    if (open) {
      setRawText('');
      setTaskChoices({});
      setUpdateRates(true);
      setApplying(false);
      setResult(null);
    }
  }, [open]);

  const parsed = useMemo(() => parseWorkLogPayload(rawText), [rawText]);
  const hasRecords = parsed.timedEntries.length > 0 || parsed.workLogs.length > 0;

  const pastedProjects = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const record of [...parsed.timedEntries, ...parsed.workLogs]) {
      byId.set(record.project.id, record.project);
    }
    return [...byId.values()];
  }, [parsed]);

  const mappingResolution = useMemo(
    () =>
      resolveProjectMappings(
        pastedProjects,
        existingMappings,
        tasks,
        new Date().toISOString()
      ),
    [pastedProjects, existingMappings, tasks]
  );

  // Stored/auto-matched mappings plus the user's dialog choices.
  const chosenMappings = useMemo(() => {
    const mappings = [...mappingResolution.resolved];
    for (const project of mappingResolution.unresolved) {
      const choice = taskChoices[project.projectId];
      if (choice?.task) {
        mappings.push({
          projectId: project.projectId,
          projectName: project.projectName,
          taskId: choice.task.id,
          taskName: choice.task.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return mappings;
  }, [mappingResolution, taskChoices]);

  const unresolvedRemaining = useMemo(
    () =>
      mappingResolution.unresolved.filter(
        project => !taskChoices[project.projectId]?.task
      ),
    [mappingResolution, taskChoices]
  );

  const pasteLedger = useMemo(
    () => buildLedgerEntries(parsed, chosenMappings, new Date().toISOString()),
    [parsed, chosenMappings]
  );

  const preview = useMemo(() => {
    if (pasteLedger.length === 0) return [];
    const { merged } = mergeLedger(existingEntries, pasteLedger);
    return buildImportPreview(pasteLedger, merged, sessions, Date.now());
  }, [pasteLedger, existingEntries, sessions]);

  const impliedRates = useMemo(() => computeImpliedRates(pasteLedger), [pasteLedger]);

  const rewriteDayCount = preview.filter(r => r.importedMinutes > 0 && !r.blocked).length;
  const blockedDayCount = preview.filter(r => r.blocked).length;

  const canApply =
    !applying &&
    hasRecords &&
    parsed.error === null &&
    unresolvedRemaining.length === 0 &&
    pasteLedger.length > 0;

  const handleApply = async () => {
    setApplying(true);
    try {
      // Rebuild from the latest props at click time (sessions refresh via the
      // work-logs-imported event between renders).
      const { merged } = mergeLedger(existingEntries, pasteLedger);
      const groupBuild = buildRewriteGroups(pasteLedger, merged, sessions, {
        nowIso: new Date().toISOString(),
      });
      const summary = await onApply({
        entries: pasteLedger,
        mappings: chosenMappings,
        rewriteGroups: groupBuild.groups,
      });
      if (!summary) return; // hook already toasted the error

      if (updateRates) {
        for (const implied of impliedRates) {
          const task = tasks.find(t => t.id === implied.taskId);
          if (task && task.hourlyRate !== implied.impliedHourlyRate) {
            await onUpdateTaskRate(implied.taskId, implied.impliedHourlyRate);
          }
        }
      }

      setResult(summary);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onClose={applying ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import work logs</DialogTitle>

      {result ? (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="success">
                Imported {result.entriesAdded} new and updated {result.entriesUpdated}{' '}
                existing entr{result.entriesAdded + result.entriesUpdated === 1 ? 'y' : 'ies'};{' '}
                {result.groupsApplied.length} day
                {result.groupsApplied.length === 1 ? ' was' : 's were'} rewritten from the
                imported data.
              </Alert>
              {result.groupsSkipped.map(skipped => (
                <Alert key={`${skipped.taskId}-${skipped.workDay}`} severity="warning">
                  {skipped.workDay}: {skipped.reason}
                </Alert>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} variant="contained">
              Close
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Paste the site's JSON payload"
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                multiline
                minRows={6}
                maxRows={10}
                fullWidth
                autoFocus
                placeholder='{"workLogs": [...], "timedWorkEntries": [...]}'
                slotProps={{
                  input: { sx: { fontFamily: '"Roboto Mono", monospace', fontSize: 13 } },
                }}
              />

              {rawText.trim() !== '' && parsed.error && (
                <Alert severity="error">{parsed.error}</Alert>
              )}
              {parsed.skippedRecords > 0 && (
                <Alert severity="warning">
                  {parsed.skippedRecords} record
                  {parsed.skippedRecords === 1 ? '' : 's'} could not be read and will be
                  skipped.
                </Alert>
              )}
              {rawText.trim() !== '' && !parsed.error && !hasRecords && (
                <Alert severity="info">Nothing to import in this payload.</Alert>
              )}

              {mappingResolution.unresolved.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Match site projects to tasks
                  </Typography>
                  <Stack spacing={1.5}>
                    {mappingResolution.unresolved.map(project => (
                      <Box
                        key={project.projectId}
                        sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, minWidth: 0 }}
                          noWrap
                          title={project.projectName}
                        >
                          {project.projectName}
                        </Typography>
                        <Box sx={{ flex: 1 }}>
                          <TaskSelector
                            value={taskChoices[project.projectId]?.name ?? ''}
                            onChange={(name, task) =>
                              setTaskChoices(prev => ({
                                ...prev,
                                [project.projectId]: { name, task: task ?? null },
                              }))
                            }
                            predefinedTasks={tasks}
                            onCreateNewTask={onCreateTask}
                            placeholder="Pick or create a task…"
                          />
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                  {unresolvedRemaining.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Select a task for every project to enable the import.
                    </Typography>
                  )}
                </Box>
              )}

              {preview.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Preview
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Day</TableCell>
                        <TableCell>Project → Task</TableCell>
                        <TableCell align="right">Tracked</TableCell>
                        <TableCell align="right">Imported</TableCell>
                        <TableCell align="right">Δ</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.map(row => (
                        <TableRow key={`${row.taskId}-${row.workDay}`}>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.workDay}</TableCell>
                          <TableCell>
                            {row.projectName}
                            {row.projectName !== row.taskName && ` → ${row.taskName}`}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: '"Roboto Mono", monospace' }}>
                            {formatDuration(row.trackedMs)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: '"Roboto Mono", monospace' }}>
                            {row.importedMinutes > 0
                              ? formatDuration(row.importedMinutes * 60_000)
                              : '—'}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontFamily: '"Roboto Mono", monospace',
                              color:
                                Math.round(row.deltaMinutes) === 0
                                  ? 'text.secondary'
                                  : row.deltaMinutes > 0
                                    ? 'success.main'
                                    : 'error.main',
                            }}
                          >
                            {row.importedMinutes > 0 ? signedMinutes(row.deltaMinutes) : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: '"Roboto Mono", monospace' }}>
                            {formatCurrency(centsToDollars(row.amountCents))}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {row.blocked && (
                              <Tooltip title="A timer is running or paused on this day — it will be skipped until you stop it.">
                                <WarningIcon color="warning" fontSize="small" />
                              </Tooltip>
                            )}
                            {row.isRemap && (
                              <Chip
                                label="overwrites previous import"
                                size="small"
                                variant="outlined"
                                sx={{ ml: 0.5 }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Applying replaces the tracked session data on {rewriteDayCount} day
                    {rewriteDayCount === 1 ? '' : 's'} with the imported entries
                    {blockedDayCount > 0 &&
                      `; ${blockedDayCount} day${blockedDayCount === 1 ? '' : 's'} will be skipped while a timer is active`}
                    .
                  </Typography>
                </Box>
              )}

              {impliedRates.length > 0 && (
                <Box>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={updateRates}
                        onChange={e => setUpdateRates(e.target.checked)}
                      />
                    }
                    label="Update task hourly rates from imported pay"
                  />
                  <Stack spacing={0.5} sx={{ pl: 4 }}>
                    {impliedRates.map(rate => {
                      const task = tasks.find(t => t.id === rate.taskId);
                      return (
                        <Typography key={rate.taskId} variant="caption" color="text.secondary">
                          {rate.taskName}:{' '}
                          {task?.hourlyRate != null
                            ? `${formatCurrency(task.hourlyRate)}/hr`
                            : 'no rate'}{' '}
                          → {formatCurrency(rate.impliedHourlyRate)}/hr
                        </Typography>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              variant="contained"
              disabled={!canApply}
              startIcon={applying ? <CircularProgress size={16} /> : undefined}
            >
              {applying ? 'Applying…' : 'Apply import'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
