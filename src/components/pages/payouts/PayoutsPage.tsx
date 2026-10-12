/**
 * Payouts Page
 *
 * The money view over the imported work-log ledger and tracked sessions:
 * what's available now, what's pending release (workDay + fundsReleaseDays),
 * the upcoming release schedule, and a per-day reconciliation of tracked vs
 * imported time. Imported amounts (cents from the site) are authoritative;
 * days without imported data show rate-based estimates.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { useSessionManagementContext } from '../../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../../contexts/TaskManagementContext';
import { useWorkLogContext } from '../../../contexts/WorkLogContext';
import { useFundsReleaseSettings } from '../../../hooks/useFundsReleaseSettings';
import { TimerState } from '../../../types/timer';
import { Task } from '../../../types/task';
import { CaptureServerStatus, WorkLogImportPayload } from '../../../types/workLog';
import {
  buildPayoutCells,
  buildReleaseSchedule,
  centsToDollars,
  formatPayoutAmount,
  groupCellsByMonth,
  summarizePayouts,
  PayoutDayCell,
} from '../../../utils/payoutCalculator';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { formatDateString } from '../../../utils/dateHelpers';
import { StatsCard } from '../../ui/display/StatsCard';
import { ImportWorkLogsDialog } from './ImportWorkLogsDialog';

const MONO = { fontFamily: '"Roboto Mono", monospace' } as const;

function deltaLabel(cell: PayoutDayCell): { text: string; color: string } {
  const deltaMinutes = cell.importedMinutes - cell.trackedMs / 60_000;
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return { text: '±0m', color: 'text.secondary' };
  const text = `${rounded > 0 ? '+' : '−'}${formatDuration(Math.abs(rounded) * 60_000)}`;
  return { text, color: rounded > 0 ? 'success.main' : 'error.main' };
}

export function PayoutsPage() {
  const { sessions } = useSessionManagementContext();
  const { tasks, addTask, updateTask } = useTaskManagementContext();
  const workLogs = useWorkLogContext();
  const { days: fundsReleaseDays } = useFundsReleaseSettings();
  const [importOpen, setImportOpen] = useState(false);

  // One-shot status of the localhost capture server (port conflicts etc.).
  const [captureServerWarning, setCaptureServerWarning] = useState<string | null>(null);
  useEffect(() => {
    invoke<CaptureServerStatus>('get_capture_server_status')
      .then(status => setCaptureServerWarning(status?.warning ?? null))
      .catch(() => {
        // Older backend without the command: nothing to surface.
      });
  }, []);

  // Same live-tick pattern as the Sessions dashboard: 1s while a timer runs
  // (estimates track live time), 60s otherwise so "today" still rolls over.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasRunningTimer = sessions.some(s =>
    s.timerInstances.some(i => i.state === TimerState.running)
  );
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), hasRunningTimer ? 1000 : 60_000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  const today = formatDateString(new Date(nowMs));
  const cells = useMemo(
    () => buildPayoutCells(workLogs.entries, sessions, tasks, fundsReleaseDays, nowMs),
    [workLogs.entries, sessions, tasks, fundsReleaseDays, nowMs]
  );
  const schedule = useMemo(
    () => buildReleaseSchedule(cells, today, workLogs.entries, fundsReleaseDays, nowMs),
    [cells, today, workLogs.entries, fundsReleaseDays, nowMs]
  );
  const summary = useMemo(
    () => summarizePayouts(cells, today, schedule, nowMs),
    [cells, today, schedule, nowMs]
  );

  // Reconciliation by month: the current month starts open (or the newest,
  // when this month has nothing yet); clicking a month flips it.
  const monthGroups = useMemo(() => groupCellsByMonth(cells), [cells]);
  const currentMonth = today.slice(0, 7);
  const defaultOpenMonth = monthGroups.some(group => group.month === currentMonth)
    ? currentMonth
    : monthGroups[0]?.month;
  const [toggledMonths, setToggledMonths] = useState<Set<string>>(() => new Set());
  const isMonthOpen = (month: string) => (month === defaultOpenMonth) !== toggledMonths.has(month);
  const toggleMonth = (month: string) =>
    setToggledMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });

  const handleCreateTask = async (name: string): Promise<Task> => {
    const task = await addTask({ name });
    if (!task) throw new Error(`Failed to create task "${name}"`);
    return task;
  };

  // A successful apply of a staged browser capture also retires the banner.
  const handleApplyImport = async (payload: WorkLogImportPayload) => {
    const summary = await workLogs.applyImport(payload);
    if (summary) workLogs.clearStagedCapture();
    return summary;
  };

  const isEmpty = workLogs.entries.length === 0 && cells.length === 0;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Payouts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Money earned on a day becomes available {fundsReleaseDays} day
            {fundsReleaseDays === 1 ? '' : 's'} later. Imported site amounts are
            authoritative; other days are estimated from tracked time.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => setImportOpen(true)}
        >
          Import work logs
        </Button>
      </Box>

      {workLogs.stagedCapture && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <>
              <Button color="inherit" size="small" onClick={() => setImportOpen(true)}>
                Review
              </Button>
              <Button color="inherit" size="small" onClick={workLogs.clearStagedCapture}>
                Dismiss
              </Button>
            </>
          }
        >
          {workLogs.stagedCapture.reason === 'unverified-link'
            ? 'Work logs arrived through a taskmint:// link. Links can be opened by any web page, so review them before importing.'
            : 'Work logs captured from DataAnnotation include a project without a task match — review to finish the import.'}
        </Alert>
      )}

      {captureServerWarning && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {captureServerWarning}
        </Alert>
      )}

      {workLogs.loadWarning && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {workLogs.loadWarning}
        </Alert>
      )}

      {summary.overduePendingCents > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {formatCurrency(centsToDollars(summary.overduePendingCents))} in reported work is awaiting site approval past its estimated release date. Re-importing work logs will update these once approved by the site.
        </Alert>
      )}

      {workLogs.isLoading && workLogs.entries.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : isEmpty ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            No payout data yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Track time on a task with an hourly rate to see estimates, or paste the
            payment site's JSON to import your reported work.
          </Typography>
          <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>
            Import work logs
          </Button>
        </Paper>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 3,
              mb: 4,
            }}
          >
            <StatsCard
              title="Available now"
              value={formatCurrency(centsToDollars(summary.availableCents))}
              subtitle={`released through ${today}`}
              icon={<WalletIcon fontSize="large" />}
              color="success"
            />
            <StatsCard
              title="Pending release"
              value={formatCurrency(centsToDollars(summary.pendingCents))}
              subtitle={
                summary.nextReleaseDay
                  ? `next: ${summary.nextReleaseDay} · ${formatCurrency(
                      centsToDollars(summary.nextReleaseCents)
                    )}`
                  : 'nothing scheduled'
              }
              icon={<ScheduleIcon fontSize="large" />}
              color="info"
            />
            <StatsCard
              title="Estimated (not imported)"
              value={formatCurrency(centsToDollars(summary.estimatedCents))}
              subtitle="tracked time × hourly rate — import to finalize"
              icon={<TrendingUpIcon fontSize="large" />}
              color="warning"
            />
          </Box>

          {schedule.length > 0 && (
            <Paper sx={{ p: 3, mb: 4 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Upcoming releases
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Release date</TableCell>
                    <TableCell align="right">Imported</TableCell>
                    <TableCell align="right">Estimated</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schedule.map((row, idx) => (
                    <TableRow key={row.releaseIso ?? `${row.releaseDay}-${row.releaseTime ?? ''}-${idx}`}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">{row.releaseDay}</Typography>
                        {row.releaseTime && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {row.releaseTime}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={MONO}>
                        {row.actualCents > 0
                          ? formatCurrency(centsToDollars(row.actualCents))
                          : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ ...MONO, color: 'text.secondary' }}>
                        {row.estimatedCents > 0
                          ? `~${formatCurrency(centsToDollars(row.estimatedCents))}`
                          : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                        {formatCurrency(centsToDollars(row.actualCents + row.estimatedCents))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Daily reconciliation
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Task</TableCell>
                    <TableCell align="right">Tracked</TableCell>
                    <TableCell align="right">Reported</TableCell>
                    <TableCell align="right">Δ</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Available on</TableCell>
                    <TableCell>Source</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {monthGroups.map(group => {
                    const open = isMonthOpen(group.month);
                    const label = dayjs(`${group.month}-01`).format('MMMM YYYY');
                    return (
                      <Fragment key={group.month}>
                        <TableRow
                          hover
                          onClick={() => toggleMonth(group.month)}
                          sx={{ cursor: 'pointer', bgcolor: 'action.hover' }}
                        >
                          <TableCell colSpan={2} sx={{ whiteSpace: 'nowrap' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <IconButton
                                size="small"
                                aria-expanded={open}
                                aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
                              >
                                {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                              </IconButton>
                              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                {label}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                            {group.trackedMs > 0 ? formatDuration(group.trackedMs) : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                            {group.importedMinutes > 0
                              ? formatDuration(group.importedMinutes * 60_000)
                              : '—'}
                          </TableCell>
                          <TableCell />
                          <TableCell align="right" sx={{ ...MONO, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {formatPayoutAmount(group.actualCents, group.estimatedCents)}
                          </TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                        {open &&
                          group.cells.map(cell => {
                            const hasImportedTime = cell.importedMinutes > 0;
                            const delta = deltaLabel(cell);
                            return (
                              <TableRow key={`${cell.taskId}-${cell.workDay}`}>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>{cell.workDay}</TableCell>
                                <TableCell>{cell.taskName}</TableCell>
                                <TableCell align="right" sx={MONO}>
                                  {cell.trackedMs > 0 ? formatDuration(cell.trackedMs) : '—'}
                                </TableCell>
                                <TableCell align="right" sx={MONO}>
                                  {hasImportedTime
                                    ? formatDuration(cell.importedMinutes * 60_000)
                                    : '—'}
                                </TableCell>
                                <TableCell
                                  align="right"
                                  sx={{ ...MONO, color: hasImportedTime ? delta.color : 'text.secondary' }}
                                >
                                  {hasImportedTime ? delta.text : '—'}
                                </TableCell>
                                <TableCell align="right" sx={{ ...MONO, whiteSpace: 'nowrap' }}>
                                  {formatPayoutAmount(cell.actualCents, cell.estimatedCents)}
                                </TableCell>
                                <TableCell>
                                  {cell.statuses.map(status => (
                                    <Chip
                                      key={status}
                                      label={status}
                                      size="small"
                                      variant="outlined"
                                      sx={{ mr: 0.5 }}
                                    />
                                  ))}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                  {cell.actualCents > 0 || cell.estimatedCents > 0
                                    ? cell.releaseDay
                                    : '—'}
                                </TableCell>
                                <TableCell>
                                  {cell.actualCents > 0 ? (
                                    <Chip label="Actual" size="small" color="success" />
                                  ) : cell.isEstimate ? (
                                    <Chip label="Estimate" size="small" color="warning" variant="outlined" />
                                  ) : (
                                    <Chip label="Tracked only" size="small" variant="outlined" />
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Statuses are shown as the site reported them; all imported amounts count toward
              availability by work day. Estimates use the rate each session was tracked at, the
              same amounts Reports, Time Entries and the Calendar show.
            </Typography>
          </Paper>
        </>
      )}

      <ImportWorkLogsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        initialText={workLogs.stagedCapture?.payloadText}
        existingEntries={workLogs.entries}
        existingMappings={workLogs.mappings}
        sessions={sessions}
        tasks={tasks}
        onApply={handleApplyImport}
        onCreateTask={handleCreateTask}
        onUpdateTaskRate={(taskId, rate) => updateTask(taskId, { hourlyRate: rate })}
      />
    </Box>
  );
}
