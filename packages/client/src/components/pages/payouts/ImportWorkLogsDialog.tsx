/**
 * Import Work Logs Dialog
 *
 * Paste the payment site's JSON, resolve unmapped projects to tasks, preview
 * the per-day overwrite, then apply. Applying rewrites the covered days'
 * session data (the site's numbers become the record) — the preview calls
 * that out per day before anything is touched.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { WarningAmber as WarningIcon } from '@mui/icons-material';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import { ProjectTaskMapping, WorkLogEntry, WorkLogImportPayload, WorkLogImportSummary } from '../../../types/workLog';
import {
  buildImportPreview,
  parseWorkLogPayload,
  payloadProjects,
  planWorkLogImport,
} from '../../../utils/workLogImport';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { centsToDollars } from '../../../utils/payoutCalculator';
import { TaskSelector } from '../../ui/forms/TaskSelector';
import { PHONE } from '../../../theme/media';
import { PHONE_TABLE } from '../../ui/tables/tableStyles';

interface ImportWorkLogsDialogProps {
  onClose: () => void;
  /** Prefills the paste box on open (e.g. a staged browser capture). */
  initialText?: string;
  existingEntries: WorkLogEntry[];
  existingMappings: ProjectTaskMapping[];
  sessions: TaskSession[];
  tasks: Task[];
  onApply: (payload: WorkLogImportPayload) => Promise<WorkLogImportSummary | null>;
  onCreateTask: (name: string) => Promise<Task>;
}

function signedMinutes(deltaMinutes: number): string {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return '±0m';
  return `${rounded > 0 ? '+' : '−'}${formatDuration(Math.abs(rounded) * 60_000)}`;
}

export function ImportWorkLogsDialog({
  onClose,
  initialText,
  existingEntries,
  existingMappings,
  sessions,
  tasks,
  onApply,
  onCreateTask,
}: ImportWorkLogsDialogProps) {
  // Rendered while open: each opening starts fresh, seeded with any staged
  // capture (a later change to it doesn't reset what's showing)
  const [rawText, setRawText] = useState(initialText ?? '');
  const [taskChoices, setTaskChoices] = useState<Record<string, Task>>({});
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<WorkLogImportSummary | null>(null);

  const parsed = useMemo(() => parseWorkLogPayload(rawText), [rawText]);
  // Archived tasks still match by stored mapping or name (planWorkLogImport
  // gets them all); the picker offers active ones, as the start pickers do
  const activeTasks = useMemo(() => tasks.filter(task => !task.isArchived), [tasks]);
  const hasRecords = parsed.timedEntries.length > 0 || parsed.workLogs.length > 0;

  // Tasks picked here for projects with no stored or same-named task
  const chosenMappings = useMemo((): ProjectTaskMapping[] => {
    const nowIso = new Date().toISOString();
    return payloadProjects(parsed).flatMap(project => {
      const task = taskChoices[project.id];
      return task
        ? [
            {
              projectId: project.id,
              projectName: project.name,
              taskId: task.id,
              taskName: task.name,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          ]
        : [];
    });
  }, [parsed, taskChoices]);

  // The pipeline browser capture uses too. Apply sends this plan: it's built
  // from the props the click handler sees.
  const plan = useMemo(
    () =>
      planWorkLogImport(parsed, {
        entries: existingEntries,
        mappings: existingMappings,
        tasks,
        sessions,
        nowIso: new Date().toISOString(),
        chosenMappings,
      }),
    [parsed, existingEntries, existingMappings, tasks, sessions, chosenMappings]
  );

  const details = plan.status === 'ready' || plan.status === 'needs-mapping' ? plan : null;
  const unmatched = details?.unmatched ?? [];
  const unresolvedRemaining = plan.status === 'needs-mapping' ? plan.unresolved : [];

  const preview = useMemo(
    () =>
      details && details.entries.length > 0
        ? buildImportPreview(details.entries, details.merged, sessions, Date.now())
        : [],
    [details, sessions]
  );

  const rewriteDayCount = preview.filter(r => r.importedMinutes > 0 && !r.blocked).length;
  const blockedDayCount = preview.filter(r => r.blocked).length;

  const ready = plan.status === 'ready' ? plan : null;

  // Imported days carry the site's own pay; task rates stay as you set them
  const handleApply = async (payload: WorkLogImportPayload) => {
    setApplying(true);
    try {
      const summary = await onApply(payload);
      if (!summary) return; // hook already toasted the error
      setResult(summary);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open onClose={applying ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import work logs</DialogTitle>

      {result ? (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="success">
                Imported {result.entriesAdded} new and updated {result.entriesUpdated} existing entr
                {result.entriesAdded + result.entriesUpdated === 1 ? 'y' : 'ies'}; {result.groupsApplied.length} day
                {result.groupsApplied.length === 1 ? ' was' : 's were'} rewritten from the imported data.
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

              {rawText.trim() !== '' && parsed.error && <Alert severity="error">{parsed.error}</Alert>}
              {parsed.skippedRecords > 0 && (
                <Alert severity="warning">
                  {parsed.skippedRecords} record
                  {parsed.skippedRecords === 1 ? '' : 's'} could not be read and will be skipped.
                </Alert>
              )}
              {rawText.trim() !== '' && !parsed.error && !hasRecords && (
                <Alert severity="info">Nothing to import in this payload.</Alert>
              )}

              {unmatched.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Match site projects to tasks
                  </Typography>
                  <Stack spacing={1.5}>
                    {unmatched.map(project => (
                      // On a phone the project's name sits above its task picker
                      <Box
                        key={project.projectId}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          [PHONE]: { flexDirection: 'column', alignItems: 'stretch', gap: 0.5 },
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, minWidth: 0, [PHONE]: { whiteSpace: 'normal' } }}
                          noWrap
                          title={project.projectName}
                        >
                          {project.projectName}
                        </Typography>
                        <Box sx={{ flex: 1 }}>
                          <TaskSelector
                            value={taskChoices[project.projectId]?.id ?? ''}
                            onChange={task => setTaskChoices(prev => ({ ...prev, [project.projectId]: task }))}
                            predefinedTasks={activeTasks}
                            onCreateNewTask={onCreateTask}
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
                  <TableContainer>
                    <Table size="small" sx={PHONE_TABLE}>
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
                              {row.importedMinutes > 0 ? formatDuration(row.importedMinutes * 60_000) : '—'}
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
                  </TableContainer>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Applying replaces the tracked session data on {rewriteDayCount} day
                    {rewriteDayCount === 1 ? '' : 's'} with the imported entries
                    {blockedDayCount > 0 &&
                      `; ${blockedDayCount} day${blockedDayCount === 1 ? '' : 's'} will be skipped while a timer is active`}
                    .
                  </Typography>
                </Box>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button
              onClick={ready ? () => void handleApply(ready.payload) : undefined}
              variant="contained"
              disabled={applying || !ready}
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
