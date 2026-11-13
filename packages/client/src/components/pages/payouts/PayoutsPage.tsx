/**
 * Payouts Page
 *
 * The money view over the imported work-log ledger and tracked sessions:
 * the next withdrawal, what's available now, what's pending release
 * (workDay + fundsReleaseDays), the upcoming release schedule (to schedule
 * the next withdrawal from, with what's held until it opens), the recorded
 * withdrawals, and a per-day reconciliation of tracked vs imported time. Imported amounts (cents from the site) are authoritative;
 * days without imported data show rate-based estimates.
 */

import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { getBackend } from '../../../backend';
import { useSessionManagementContext } from '../../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../../contexts/TaskManagementContext';
import { useWorkLogContext } from '../../../contexts/WorkLogContext';
import { useNotification } from '../../../contexts/NotificationContext';
import { describeImport } from '../../../hooks/useWorkLogs';
import { Task } from '../../../types/task';
import { WorkLogImportPayload } from '../../../types/workLog';
import { centsToDollars, formatCents } from '../../../utils/payoutCalculator';
import { formatCurrency } from '../../../utils/formatters';
import { StatsCard } from '../../ui/display/StatsCard';
import { EmptyState } from '../../ui/display/EmptyState';
import { PageContainer, PageHeader } from '../../layout/PageLayout';
import { ImportWorkLogsDialog } from './ImportWorkLogsDialog';
import { ProjectMappingsCard } from './ProjectMappingsCard';
import { ReconciliationTable } from './ReconciliationTable';
import { ReleaseScheduleTable } from './ReleaseScheduleTable';
import { usePayoutData } from '../../../hooks/usePayoutData';
import { NextWithdrawalPanel } from './withdrawals/NextWithdrawalPanel';
import { WithdrawalsCard } from './withdrawals/WithdrawalsCard';
import { formatShortDateTime } from '../../../utils/locale';
import { PHONE } from '../../../theme/media';

interface PayoutsPageProps {
  /** Open the import as the page opens (Home's nudge, the menu bar's Import Work Logs…). */
  importRequested?: boolean;
  /** Called once the import has opened for the request. */
  onImportRequestHandled?: () => void;
}

export function PayoutsPage({ importRequested = false, onImportRequestHandled }: PayoutsPageProps = {}) {
  const { sessions } = useSessionManagementContext();
  const { tasks, addTask } = useTaskManagementContext();
  const workLogs = useWorkLogContext();
  const { showSuccess } = useNotification();
  const { fundsReleaseDays, today, summary, monthGroups, plan, lastImport, importIsStale, isEmpty } = usePayoutData();
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    if (!importRequested) return;
    setImportOpen(true);
    onImportRequestHandled?.();
  }, [importRequested, onImportRequestHandled]);

  // One-shot status of the localhost capture server (port conflicts etc.),
  // where the platform runs one.
  const [captureServerWarning, setCaptureServerWarning] = useState<string | null>(null);
  useEffect(() => {
    const captureStatus = getBackend().platform.captureStatus;
    if (!captureStatus) return;
    captureStatus()
      .then(status => setCaptureServerWarning(status.warning))
      .catch(error => console.warn('Failed to read the capture server status:', error));
  }, []);

  const handleCreateTask = async (name: string): Promise<Task> => {
    const task = await addTask({ name });
    if (!task) throw new Error(`Failed to create task "${name}"`);
    return task;
  };

  // A successful apply of a staged browser capture also retires the banner.
  // Its notice can undo it, as a delete's can.
  const handleApplyImport = async (payload: WorkLogImportPayload) => {
    const summary = await workLogs.applyImport(payload);
    if (summary) {
      workLogs.clearStagedCapture();
      showSuccess(describeImport(summary), {
        category: 'workLog',
        title: 'Work logs imported',
        desktop: 'never',
        actions: [{ label: 'Undo', onClick: () => void workLogs.undoImport(summary.undo) }],
      });
    }
    return summary;
  };

  return (
    <PageContainer>
      <PageHeader
        title="Payouts"
        subtitle={`Money earned on a day becomes available ${fundsReleaseDays} day${
          fundsReleaseDays === 1 ? '' : 's'
        } later. Imported site amounts are authoritative; other days are estimated from tracked time.`}
        actions={
          <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>
            Import work logs
          </Button>
        }
      >
        {lastImport !== null && (
          <Typography variant="body2" sx={{ mt: 0.5, color: importIsStale ? 'warning.main' : 'text.secondary' }}>
            Last import: {formatShortDateTime(lastImport)}
            {importIsStale && ' — visit the payments page to refresh'}
          </Typography>
        )}
      </PageHeader>

      {workLogs.stagedCapture && (
        <Alert
          severity="info"
          // On a phone the buttons go below the message
          sx={{
            mb: 3,
            [PHONE]: {
              flexWrap: 'wrap',
              '& .MuiAlert-message': { flex: 1 },
              '& .MuiAlert-action': { flexBasis: '100%', justifyContent: 'flex-end', m: 0, p: 0 },
            },
          }}
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
          {formatCurrency(centsToDollars(summary.overduePendingCents))} in reported work is awaiting site approval past
          its estimated release date. Re-importing work logs will update these once approved by the site.
        </Alert>
      )}

      {workLogs.isLoading && workLogs.entries.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : isEmpty ? (
        <EmptyState
          icon={<WalletIcon />}
          title="No payout data yet"
          description="Track time on a task with an hourly rate to see estimates, or import your reported work from the payment site."
          action={
            <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>
              Import work logs
            </Button>
          }
        />
      ) : (
        <>
          <NextWithdrawalPanel />

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 3,
              mb: 4,
              // Two narrower columns on a phone, and a last card left alone on
              // its row takes the whole row
              [PHONE]: {
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 2,
                mb: 3,
                '& > :last-child:nth-of-type(odd)': { gridColumn: '1 / -1' },
              },
            }}
          >
            {plan ? (
              <StatsCard
                title="Available to withdraw"
                value={`${plan.availableNow.estimatedCents > 0 ? '~' : ''}${formatCents(plan.availableNow.totalCents)}`}
                subtitle={`released since your withdrawal on ${formatShortDateTime(plan.last.takenAt)}`}
                icon={<WalletIcon fontSize="large" />}
                color="success"
              />
            ) : (
              <StatsCard
                title="Available now"
                value={formatCurrency(centsToDollars(summary.availableCents))}
                subtitle={`released through ${today}, as the site reported at the last import`}
                icon={<WalletIcon fontSize="large" />}
                color="success"
              />
            )}
            <StatsCard
              title="Pending release"
              value={formatCurrency(centsToDollars(summary.pendingCents))}
              subtitle={
                summary.nextReleaseDay
                  ? `next: ${summary.nextReleaseDay} · ${formatCurrency(centsToDollars(summary.nextReleaseCents))}`
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

          <ReleaseScheduleTable />
          <WithdrawalsCard />
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

      {importOpen && (
        <ImportWorkLogsDialog
          onClose={() => setImportOpen(false)}
          initialText={workLogs.stagedCapture?.payloadText}
          existingEntries={workLogs.entries}
          existingMappings={workLogs.mappings}
          sessions={sessions}
          tasks={tasks}
          onApply={handleApplyImport}
          onCreateTask={handleCreateTask}
        />
      )}
    </PageContainer>
  );
}
