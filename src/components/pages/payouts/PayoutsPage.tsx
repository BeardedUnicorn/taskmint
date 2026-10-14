/**
 * Payouts Page
 *
 * The money view over the imported work-log ledger and tracked sessions:
 * what's available now, what's pending release (workDay + fundsReleaseDays),
 * the upcoming release schedule, and a per-day reconciliation of tracked vs
 * imported time. Imported amounts (cents from the site) are authoritative;
 * days without imported data show rate-based estimates.
 */

import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Typography } from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { useSessionManagementContext } from '../../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../../contexts/TaskManagementContext';
import { useWorkLogContext } from '../../../contexts/WorkLogContext';
import { Task } from '../../../types/task';
import { CaptureServerStatus, WorkLogImportPayload } from '../../../types/workLog';
import { centsToDollars } from '../../../utils/payoutCalculator';
import { formatCurrency } from '../../../utils/formatters';
import { StatsCard } from '../../ui/display/StatsCard';
import { ImportWorkLogsDialog } from './ImportWorkLogsDialog';
import { ProjectMappingsCard } from './ProjectMappingsCard';
import { ReconciliationTable } from './ReconciliationTable';
import { ReleaseScheduleTable } from './ReleaseScheduleTable';
import { usePayoutData } from './usePayoutData';

export function PayoutsPage() {
  const { sessions } = useSessionManagementContext();
  const { tasks, addTask, updateTask } = useTaskManagementContext();
  const workLogs = useWorkLogContext();
  const { fundsReleaseDays, today, schedule, summary, monthGroups, lastImport, importIsStale, isEmpty } =
    usePayoutData();
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
          {lastImport !== null && (
            <Typography
              variant="body2"
              sx={{ mt: 0.5, color: importIsStale ? 'warning.main' : 'text.secondary' }}
            >
              Last import:{' '}
              {new Date(lastImport).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {importIsStale && ' — visit the payments page to refresh'}
            </Typography>
          )}
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

          <ReleaseScheduleTable schedule={schedule} />
          <ReconciliationTable monthGroups={monthGroups} today={today} />
        </>
      )}

      <ProjectMappingsCard
        mappings={workLogs.mappings}
        entries={workLogs.entries}
        sessions={sessions}
        tasks={tasks}
        onApply={workLogs.applyImport}
      />

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
