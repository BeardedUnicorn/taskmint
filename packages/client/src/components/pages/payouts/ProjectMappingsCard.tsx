/**
 * Project Mappings
 *
 * Which task each site project's time and pay go to. A mapping is chosen once,
 * at the project's first import; this card lists them and moves a project to
 * another task, past imported days included (buildRemapPlan).
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import { ProjectTaskMapping, WorkLogEntry, WorkLogImportPayload, WorkLogImportSummary } from '../../../types/workLog';
import { buildRemapPlan, RemapPlan } from '../../../utils/workLogImport';
import { formatDuration } from '../../../utils/formatters';
import { ConfirmDialog } from '../../ui/dialogs/ConfirmDialog';
import { useNotification } from '../../../contexts/NotificationContext';
import { PHONE } from '../../../theme/media';
import { PHONE_TABLE } from '../../ui/tables/tableStyles';

interface ProjectMappingsCardProps {
  mappings: ProjectTaskMapping[];
  entries: WorkLogEntry[];
  sessions: TaskSession[];
  tasks: Task[];
  onApply: (payload: WorkLogImportPayload) => Promise<WorkLogImportSummary | null>;
}

interface PendingRemap {
  mapping: ProjectTaskMapping;
  task: Task;
  plan: RemapPlan;
}

function remapMessage({ mapping, task, plan }: PendingRemap): string {
  const days = plan.days.length;
  const parts = [
    `${plan.entries.length} imported ${plan.entries.length === 1 ? 'entry' : 'entries'} from "${mapping.projectName}" ${plan.entries.length === 1 ? 'moves' : 'move'} to "${task.name}", and ${days} ${days === 1 ? 'day is' : 'days are'} rebuilt${days > 0 ? ` (${plan.days.join(', ')})` : ''}.`,
  ];
  if (plan.replacedTrackedMs > 0) {
    parts.push(
      `The ${formatDuration(plan.replacedTrackedMs)} you tracked on "${task.name}" those days is replaced by the imported time, as an import would.`
    );
  }
  return parts.join(' ');
}

export function ProjectMappingsCard({ mappings, entries, sessions, tasks, onApply }: ProjectMappingsCardProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingRemap | null>(null);
  // The outcome of the last change, shown in the card
  const { showError, showSuccess, showWarning } = useNotification();

  const entryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.projectId, (counts.get(entry.projectId) ?? 0) + 1);
    return counts;
  }, [entries]);

  const sortedMappings = useMemo(
    () => [...mappings].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    [mappings]
  );

  if (mappings.length === 0) return null;

  const optionsFor = (mapping: ProjectTaskMapping) =>
    tasks.filter(task => !task.isArchived || task.id === mapping.taskId).sort((a, b) => a.name.localeCompare(b.name));

  // (The select offers listed tasks only, and reports only a change)
  const handleChange = (mapping: ProjectTaskMapping, taskId: string) => {
    const task = tasks.find(t => t.id === taskId)!;
    const plan = buildRemapPlan({
      projectId: mapping.projectId,
      newTask: task,
      ledger: entries,
      sessions,
      mappings,
      nowIso: new Date().toISOString(),
    });
    if ('error' in plan) {
      showError(plan.error);
      return;
    }
    setPending({ mapping, task, plan });
  };

  const handleConfirm = async ({ mapping, task, plan }: PendingRemap) => {
    const summary = await onApply({
      entries: plan.entries,
      mappings: plan.mappings,
      rewriteGroups: plan.groups,
      isRemap: true,
    });
    if (!summary) return; // the failure is already shown
    if (summary.groupsSkipped.length > 0) {
      showWarning(
        `Some days weren't moved: ${summary.groupsSkipped.map(g => `${g.workDay} (${g.reason})`).join('; ')}`,
        { category: 'workLog', duration: null }
      );
    } else {
      showSuccess(`"${mapping.projectName}" now goes to "${task.name}".`, { category: 'workLog' });
    }
  };

  return (
    <Paper sx={{ p: 3, mt: 4, [PHONE]: { p: 2 } }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setOpen(prev => !prev)}
      >
        <Box>
          <Typography variant="h6">Project mappings</Typography>
          <Typography variant="body2" color="text.secondary">
            Which task each project's time and pay go to
          </Typography>
        </Box>
        <IconButton size="small" aria-label={open ? 'Hide project mappings' : 'Show project mappings'}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={open} unmountOnExit>
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small" sx={PHONE_TABLE}>
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Task</TableCell>
                <TableCell align="right">Entries</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedMappings.map(mapping => (
                <TableRow key={mapping.projectId}>
                  <TableCell>{mapping.projectName}</TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={mapping.taskId}
                      onChange={event => handleChange(mapping, event.target.value)}
                      inputProps={{ 'aria-label': `Task for ${mapping.projectName}` }}
                      sx={{ minWidth: 220, [PHONE]: { minWidth: 160 } }}
                    >
                      {optionsFor(mapping).map(task => (
                        <MenuItem key={task.id} value={task.id}>
                          {task.name}
                        </MenuItem>
                      ))}
                      {!tasks.some(task => task.id === mapping.taskId) && (
                        // The mapped task was deleted; the next import asks again
                        <MenuItem value={mapping.taskId} disabled>
                          {mapping.taskName} (deleted)
                        </MenuItem>
                      )}
                    </Select>
                  </TableCell>
                  <TableCell align="right">{entryCounts.get(mapping.projectId) ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>

      {pending && (
        <ConfirmDialog
          open
          title={`Move "${pending.mapping.projectName}" to "${pending.task.name}"?`}
          message={remapMessage(pending)}
          confirmLabel="Move"
          severity="warning"
          onConfirm={() => handleConfirm(pending)}
          onClose={() => setPending(null)}
        />
      )}
    </Paper>
  );
}
