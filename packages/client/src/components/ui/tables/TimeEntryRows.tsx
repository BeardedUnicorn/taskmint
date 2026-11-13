/**
 * Time entries as a phone's rows (History's and a task's own): the task or
 * the day, when it ran and for how long, what it earned, and Edit and Delete
 * behind ⋮. An imported entry is read-only (each import rebuilds it), so it
 * has a lock and a note instead.
 */

import { Chip } from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Lock as LockIcon } from '@mui/icons-material';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { WORKLOG_IMPORT_SOURCE } from '../../../types/workLog';
import { formatDuration } from '../../../utils/formatters';
import { formatLocalDate, formatLocalTime } from '../../../utils/dateHelpers';
import { entryEarnings } from '../../../utils/earnings';
import { sourceLabel } from '../../../utils/csvExport';
import { EarningsDisplay } from '../display/EarningsDisplay';
import { RowMenu, StackedList, StackedRow } from './StackedRows';

export interface TimeEntryRowsProps {
  entries: TimeEntry[];
  tasks: Task[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entryId: string) => void;
  /** Names each row by its task (History); else by its day (a task's own list). */
  showTask: boolean;
  /** Each row's earnings (a task with no rate has none to show). */
  showEarnings?: boolean;
  label: string;
}

/** "7:12 PM – 9:57 PM", or "7:12 PM – now" while it runs. */
function timesOf(entry: TimeEntry): string {
  const start = formatLocalTime(entry.startTime);
  if (entry.endTime) return `${start} – ${formatLocalTime(entry.endTime)}`;
  if (entry.duration) return `${start} – ${formatLocalTime(new Date(entry.startTime.getTime() + entry.duration))}`;
  return `${start} – now`;
}

export function TimeEntryRows({
  entries,
  tasks,
  onEdit,
  onDelete,
  showTask,
  showEarnings = true,
  label,
}: TimeEntryRowsProps) {
  return (
    <StackedList label={label}>
      {entries.map(entry => {
        const day = formatLocalDate(entry.startTime);
        const isImported = entry.source === WORKLOG_IMPORT_SOURCE;
        // Its length: recorded, or from its end (an older entry may lack one); none while it runs
        const lengthMs =
          entry.duration ?? (entry.endTime ? entry.endTime.getTime() - entry.startTime.getTime() : undefined);
        // Tracked is the usual: only Imported and Manual are marked
        const source = sourceLabel(entry.source);
        return (
          <StackedRow
            key={entry.id}
            title={showTask ? entry.taskName : day}
            figure={showEarnings ? <EarningsDisplay amount={entryEarnings(entry, tasks)} /> : undefined}
            details={
              <>
                <span>{showTask ? `${day} · ${timesOf(entry)}` : timesOf(entry)}</span>
                {lengthMs === undefined ? (
                  <Chip label="Running" size="small" color="primary" />
                ) : (
                  <span>{formatDuration(lengthMs)}</span>
                )}
                {source !== 'Tracked' && (
                  <Chip label={source} size="small" variant="outlined" color={isImported ? 'secondary' : 'default'} />
                )}
                {isImported && <span>Set by the work-log import; re-import to change it.</span>}
              </>
            }
            actions={
              isImported ? (
                <LockIcon
                  fontSize="small"
                  sx={{ color: 'text.disabled', mx: 1.25 }}
                  aria-label="Imported entries are read-only"
                />
              ) : (
                <RowMenu
                  label={`Actions for ${entry.taskName} on ${day} at ${formatLocalTime(entry.startTime)}`}
                  actions={[
                    { label: 'Edit', icon: <EditIcon fontSize="small" />, onClick: () => onEdit(entry) },
                    {
                      label: 'Delete',
                      icon: <DeleteIcon fontSize="small" />,
                      onClick: () => onDelete(entry.id),
                      danger: true,
                    },
                  ]}
                />
              )
            }
          />
        );
      })}
    </StackedList>
  );
}
