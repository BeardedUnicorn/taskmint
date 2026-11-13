import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Lock as LockIcon } from '@mui/icons-material';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { EarningsDisplay } from '../display/EarningsDisplay';
import { formatDuration } from '../../../utils/formatters';
import { formatLocalDate, formatLocalTime } from '../../../utils/dateHelpers';
import { entryEarnings } from '../../../utils/earnings';
import { sourceLabel } from '../../../utils/csvExport';
import { WORKLOG_IMPORT_SOURCE } from '../../../types/workLog';
import dayjs from 'dayjs';
import { PHONE } from '../../../theme/media';
import { PHONE_TABLE } from './tableStyles';
import { TimeEntryRows } from './TimeEntryRows';
import { useCompactLayout } from '../../../hooks/useCompactLayout';

export type SortField = 'taskName' | 'startTime' | 'endTime' | 'duration' | 'date' | 'earnings' | 'source';
export type SortDirection = 'asc' | 'desc';

/** What each column sorts by (a running entry has no end or duration yet: 0). */
const SORT_VALUE: Record<SortField, (entry: TimeEntry, tasks: Task[]) => string | number> = {
  taskName: entry => entry.taskName.toLowerCase(),
  startTime: entry => entry.startTime.getTime(),
  endTime: entry => entry.endTime?.getTime() ?? 0,
  duration: entry => entry.duration ?? 0,
  date: entry => dayjs(entry.startTime).format('YYYY-MM-DD'),
  earnings: (entry, tasks) => entryEarnings(entry, tasks),
  source: entry => sourceLabel(entry.source),
};

/**
 * Sort time entries for the table. Callers that paginate must sort the full
 * list first — sorting only the visible page leaves the order of pages wrong.
 */
export function sortTimeEntries(
  entries: TimeEntry[],
  tasks: Task[],
  sortField: SortField,
  sortDirection: SortDirection
): TimeEntry[] {
  const value = SORT_VALUE[sortField];
  const sign = sortDirection === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const aValue = value(a, tasks);
    const bValue = value(b, tasks);
    if (aValue < bValue) return -sign;
    if (aValue > bValue) return sign;
    return 0;
  });
}

const COLUMNS: { field: SortField; label: string }[] = [
  { field: 'taskName', label: 'Task' },
  { field: 'date', label: 'Date' },
  { field: 'startTime', label: 'Start Time' },
  { field: 'endTime', label: 'End Time' },
  { field: 'duration', label: 'Duration' },
  { field: 'source', label: 'Source' },
  { field: 'earnings', label: 'Earnings' },
];

/** A phone's sort orders, in place of the column headers: `field:direction`. */
const PHONE_SORTS: { value: `${SortField}:${SortDirection}`; label: string }[] = [
  { value: 'startTime:desc', label: 'Newest first' },
  { value: 'startTime:asc', label: 'Oldest first' },
  { value: 'duration:desc', label: 'Longest first' },
  { value: 'earnings:desc', label: 'Most earned first' },
  { value: 'taskName:asc', label: 'Task, A to Z' },
];

export interface TimeEntriesTableProps {
  /** One page of entries, already sorted (sortTimeEntries) */
  entries: TimeEntry[];
  tasks: Task[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entryId: string) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  /** A header was clicked: sort by it, ascending first, then the other way. */
  onSort: (field: SortField, direction: SortDirection) => void;
}

export function TimeEntriesTable({
  entries,
  tasks,
  onEdit,
  onDelete,
  sortField,
  sortDirection,
  onSort,
}: TimeEntriesTableProps) {
  const handleSort = (field: SortField) =>
    onSort(field, sortField === field && sortDirection === 'asc' ? 'desc' : 'asc');
  const compact = useCompactLayout();

  if (compact) {
    const current = `${sortField}:${sortDirection}`;
    return (
      <Box>
        <FormControl size="small" sx={{ mb: 1, minWidth: 200 }}>
          <InputLabel id="time-entries-sort">Sort by</InputLabel>
          <Select
            labelId="time-entries-sort"
            label="Sort by"
            // A desktop's column sort a phone doesn't offer shows as none picked
            value={PHONE_SORTS.some(sort => sort.value === current) ? current : ''}
            onChange={event => {
              const [field, direction] = event.target.value.split(':') as [SortField, SortDirection];
              onSort(field, direction);
            }}
          >
            {PHONE_SORTS.map(sort => (
              <MenuItem key={sort.value} value={sort.value}>
                {sort.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TimeEntryRows
          entries={entries}
          tasks={tasks}
          onEdit={onEdit}
          onDelete={onDelete}
          showTask
          label="Time entries"
        />
      </Box>
    );
  }

  return (
    <Paper variant="outlined">
      {/* On a phone the page scrolls down and the table only sideways */}
      <TableContainer sx={{ maxHeight: 600, [PHONE]: { maxHeight: 'none' } }}>
        <Table stickyHeader size="small" sx={PHONE_TABLE}>
          <TableHead>
            <TableRow>
              {COLUMNS.map(({ field, label }) => (
                <TableCell key={field}>
                  <TableSortLabel
                    active={sortField === field}
                    direction={sortField === field ? sortDirection : 'asc'}
                    onClick={() => handleSort(field)}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {label}
                    </Typography>
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell align="right">
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Actions
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {entries.map(entry => {
              // Imported days are rebuilt by every import, so they're read-only
              const isImported = entry.source === WORKLOG_IMPORT_SOURCE;

              return (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {entry.taskName}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{formatLocalDate(entry.startTime)}</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{formatLocalTime(entry.startTime)}</Typography>
                  </TableCell>

                  <TableCell>
                    {entry.endTime ? (
                      <Typography variant="body2">{formatLocalTime(entry.endTime)}</Typography>
                    ) : (
                      <Chip label="Running" size="small" color="primary" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{entry.duration ? formatDuration(entry.duration) : '-'}</Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={sourceLabel(entry.source)}
                      size="small"
                      variant="outlined"
                      color={isImported ? 'secondary' : 'default'}
                    />
                  </TableCell>

                  <TableCell>
                    <EarningsDisplay amount={entryEarnings(entry, tasks)} />
                  </TableCell>

                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5}>
                      {isImported ? (
                        <Tooltip title="Set by the work-log import. Re-import to change it.">
                          <Box
                            component="span"
                            aria-label="Imported entries are read-only"
                            sx={{ display: 'inline-flex', p: 0.625, color: 'text.disabled' }}
                          >
                            <LockIcon fontSize="small" />
                          </Box>
                        </Tooltip>
                      ) : (
                        <>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => onEdit(entry)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => onDelete(entry.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
