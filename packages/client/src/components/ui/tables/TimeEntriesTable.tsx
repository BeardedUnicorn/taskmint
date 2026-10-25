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
  Stack,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Notes as NotesIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { EarningsDisplay } from '../display/EarningsDisplay';
import { formatDuration } from '../../../utils/formatters';
import { formatLocalTime } from '../../../utils/dateHelpers';
import { entryEarnings } from '../../../utils/earnings';
import { sourceLabel } from '../../../utils/csvExport';
import { WORKLOG_IMPORT_SOURCE } from '../../../types/workLog';
import dayjs from 'dayjs';

export type SortField = 'taskName' | 'startTime' | 'endTime' | 'duration' | 'date' | 'earnings' | 'source';
export type SortDirection = 'asc' | 'desc';

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
  return [...entries].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sortField) {
      case 'taskName':
        aValue = a.taskName.toLowerCase();
        bValue = b.taskName.toLowerCase();
        break;
      case 'startTime':
        aValue = new Date(a.startTime).getTime();
        bValue = new Date(b.startTime).getTime();
        break;
      case 'endTime':
        aValue = a.endTime ? new Date(a.endTime).getTime() : 0;
        bValue = b.endTime ? new Date(b.endTime).getTime() : 0;
        break;
      case 'duration':
        aValue = a.duration || 0;
        bValue = b.duration || 0;
        break;
      case 'date':
        aValue = dayjs(a.startTime).format('YYYY-MM-DD');
        bValue = dayjs(b.startTime).format('YYYY-MM-DD');
        break;
      case 'earnings':
        aValue = entryEarnings(a, tasks);
        bValue = entryEarnings(b, tasks);
        break;
      case 'source':
        aValue = sourceLabel(a.source);
        bValue = sourceLabel(b.source);
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

export interface TimeEntriesTableProps {
  entries: TimeEntry[];
  tasks: Task[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entryId: string) => void;
  onViewNotes?: (entry: TimeEntry) => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSort?: (field: SortField, direction: SortDirection) => void;
  showEarnings?: boolean;
  showNotes?: boolean;
  maxHeight?: string | number;
}

export function TimeEntriesTable({
  entries,
  tasks,
  onEdit,
  onDelete,
  onViewNotes,
  sortField = 'startTime',
  sortDirection = 'desc',
  onSort,
  showEarnings = true,
  showNotes = false,
  maxHeight = 600,
}: TimeEntriesTableProps) {
  // Rows render in the order given: the page sorts the full filtered list
  // (sortTimeEntries) before paginating, and the header only reports clicks.
  const calculateEarnings = (entry: TimeEntry): number => entryEarnings(entry, tasks);

  const handleSort = (field: SortField) => {
    if (!onSort) return;
    
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(field, newDirection);
  };

  return (
    <Paper variant="outlined">
      <TableContainer sx={{ maxHeight }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'taskName'}
                  direction={sortField === 'taskName' ? sortDirection : 'asc'}
                  onClick={() => handleSort('taskName')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Task
                  </Typography>
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel
                  active={sortField === 'date'}
                  direction={sortField === 'date' ? sortDirection : 'asc'}
                  onClick={() => handleSort('date')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Date
                  </Typography>
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel
                  active={sortField === 'startTime'}
                  direction={sortField === 'startTime' ? sortDirection : 'asc'}
                  onClick={() => handleSort('startTime')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Start Time
                  </Typography>
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel
                  active={sortField === 'endTime'}
                  direction={sortField === 'endTime' ? sortDirection : 'asc'}
                  onClick={() => handleSort('endTime')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    End Time
                  </Typography>
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel
                  active={sortField === 'duration'}
                  direction={sortField === 'duration' ? sortDirection : 'asc'}
                  onClick={() => handleSort('duration')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Duration
                  </Typography>
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel
                  active={sortField === 'source'}
                  direction={sortField === 'source' ? sortDirection : 'asc'}
                  onClick={() => handleSort('source')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Source
                  </Typography>
                </TableSortLabel>
              </TableCell>

              {showEarnings && (
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'earnings'}
                    direction={sortField === 'earnings' ? sortDirection : 'asc'}
                    onClick={() => handleSort('earnings')}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Earnings
                    </Typography>
                  </TableSortLabel>
                </TableCell>
              )}

              <TableCell align="right">
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Actions
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {entries.map((entry) => {
              const earnings = calculateEarnings(entry);
              // Imported days are rebuilt by every import, so they're read-only
              const isImported = entry.source === WORKLOG_IMPORT_SOURCE;
              const entryDate = dayjs(entry.startTime).format('MMM DD, YYYY');

              return (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {entry.taskName}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {entryDate}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {formatLocalTime(entry.startTime)}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    {entry.endTime ? (
                      <Typography variant="body2">{formatLocalTime(entry.endTime)}</Typography>
                    ) : (
                      <Chip label="Running" size="small" color="primary" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {entry.duration ? formatDuration(entry.duration) : '-'}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={sourceLabel(entry.source)}
                      size="small"
                      variant="outlined"
                      color={isImported ? 'secondary' : 'default'}
                    />
                  </TableCell>

                  {showEarnings && (
                    <TableCell>
                      <EarningsDisplay amount={earnings} />
                    </TableCell>
                  )}

                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5}>
                      {showNotes && onViewNotes && (
                        <Tooltip title="View Notes">
                          <IconButton
                            size="small"
                            onClick={() => onViewNotes(entry)}
                          >
                            <NotesIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      
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
                            <IconButton
                              size="small"
                              onClick={() => onEdit(entry)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => onDelete(entry.id)}
                            >
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

      {entries.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No time entries found
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
