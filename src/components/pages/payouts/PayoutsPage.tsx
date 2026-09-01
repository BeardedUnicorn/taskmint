/**
 * Payouts Page
 *
 * The money view over the imported work-log ledger and tracked sessions:
 * what's available now, what's pending release (workDay + fundsReleaseDays),
 * the upcoming release schedule, and a per-day reconciliation of tracked vs
 * imported time. Imported amounts (cents from the site) are authoritative;
 * days without imported data show rate-based estimates.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { useSessionManagementContext } from '../../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../../contexts/TaskManagementContext';
import { useWorkLogs } from '../../../hooks/useWorkLogs';
import { useFundsReleaseSettings } from '../../../hooks/useFundsReleaseSettings';
import { TimerState } from '../../../types/timer';
import { Task } from '../../../types/task';
import {
  buildPayoutCells,
  buildReleaseSchedule,
  centsToDollars,
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
  const workLogs = useWorkLogs();
  const { days: fundsReleaseDays } = useFundsReleaseSettings();
  const [importOpen, setImportOpen] = useState(false);

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
  const summary = useMemo(() => summarizePayouts(cells, today), [cells, today]);
  const schedule = useMemo(() => buildReleaseSchedule(cells, today), [cells, today]);

  const handleCreateTask = async (name: string): Promise<Task> => {
    const task = await addTask({ name });
    if (!task) throw new Error(`Failed to create task "${name}"`);
    return task;
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

      {workLogs.loadWarning && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {workLogs.loadWarning}
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
                  {schedule.map(row => (
                    <TableRow key={row.releaseDay}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.releaseDay}</TableCell>
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
                  {cells.map(cell => {
                    const hasImportedTime = cell.importedMinutes > 0;
                    const delta = deltaLabel(cell);
                    const amountParts = [
                      cell.actualCents > 0 && formatCurrency(centsToDollars(cell.actualCents)),
                      cell.estimatedCents > 0 &&
                        `~${formatCurrency(centsToDollars(cell.estimatedCents))}`,
                    ].filter(Boolean) as string[];
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
                        <TableCell align="right" sx={MONO}>
                          {amountParts.length > 0 ? amountParts.join(' + ') : '—'}
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
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Statuses are shown as the site reported them; all imported amounts count toward
              availability by work day. Other pages estimate earnings from task hourly rates —
              this page is authoritative for imported amounts.
            </Typography>
          </Paper>
        </>
      )}

      <ImportWorkLogsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existingEntries={workLogs.entries}
        existingMappings={workLogs.mappings}
        sessions={sessions}
        tasks={tasks}
        onApply={workLogs.applyImport}
        onCreateTask={handleCreateTask}
        onUpdateTaskRate={(taskId, rate) => updateTask(taskId, { hourlyRate: rate })}
      />
    </Box>
  );
}
