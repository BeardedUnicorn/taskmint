import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Checkbox,
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
} from '@mui/icons-material';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { EarningsDisplay } from '../display/EarningsDisplay';
import { formatDuration } from '../../../utils/formatters';
import { formatLocalTime } from '../../../utils/dateHelpers';
import dayjs from 'dayjs';

export type SortField = 'taskName' | 'startTime' | 'endTime' | 'duration' | 'date' | 'earnings';
export type SortDirection = 'asc' | 'desc';

export interface TimeEntriesTableProps {
  entries: TimeEntry[];
  tasks: Task[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entryId: string) => void;
  onViewNotes?: (entry: TimeEntry) => void;
  onBulkDelete?: (entryIds: string[]) => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSort?: (field: SortField, direction: SortDirection) => void;
  showBulkActions?: boolean;
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
  onBulkDelete,
  sortField = 'startTime',
  sortDirection = 'desc',
  onSort,
  showBulkActions = false,
  showEarnings = true,
  showNotes = false,
  maxHeight = 600,
}: TimeEntriesTableProps) {
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  // Helper functions
  const getTaskById = (taskId?: string) => {
    if (!taskId) return undefined;
    return tasks.find(task => task.id === taskId);
  };

  const getTaskByName = (taskName: string) => {
    return tasks.find(task => task.name === taskName);
  };

  const calculateEarnings = (entry: TimeEntry): number => {
    if (!entry.duration) return 0;
    
    const task = entry.taskId ? getTaskById(entry.taskId) : getTaskByName(entry.taskName);
    if (!task?.hourlyRate) return 0;
    
    const hours = entry.duration / (1000 * 60 * 60);
    return hours * task.hourlyRate;
  };

  // Sorting logic
  const sortedEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      let aValue: any;
      let bValue: any;

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
          aValue = calculateEarnings(a);
          bValue = calculateEarnings(b);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [entries, sortField, sortDirection, tasks]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEntries(new Set(entries.map(entry => entry.id)));
    } else {
      setSelectedEntries(new Set());
    }
  };

  const handleSelectEntry = (entryId: string, checked: boolean) => {
    const newSelected = new Set(selectedEntries);
    if (checked) {
      newSelected.add(entryId);
    } else {
      newSelected.delete(entryId);
    }
    setSelectedEntries(newSelected);
  };

  const handleSort = (field: SortField) => {
    if (!onSort) return;
    
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(field, newDirection);
  };

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedEntries.size > 0) {
      onBulkDelete(Array.from(selectedEntries));
      setSelectedEntries(new Set());
    }
  };

  const isAllSelected = selectedEntries.size === entries.length && entries.length > 0;
  const isIndeterminate = selectedEntries.size > 0 && selectedEntries.size < entries.length;

  return (
    <Paper variant="outlined">
      {/* Bulk Actions Bar */}
      {showBulkActions && selectedEntries.size > 0 && (
        <Box sx={{ p: 2, bgcolor: 'action.selected' }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">
              {selectedEntries.size} entries selected
            </Typography>
            <IconButton
              color="error"
              onClick={handleBulkDelete}
              disabled={!onBulkDelete}
              aria-label="Delete selected entries"
            >
              <DeleteIcon />
            </IconButton>
          </Stack>
        </Box>
      )}

      <TableContainer sx={{ maxHeight }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {showBulkActions && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={isIndeterminate}
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
              )}
              
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
            {sortedEntries.map((entry) => {
              const earnings = calculateEarnings(entry);
              const isSelected = selectedEntries.has(entry.id);
              const entryDate = dayjs(entry.startTime).format('MMM DD, YYYY');

              return (
                <TableRow key={entry.id} hover selected={isSelected}>
                  {showBulkActions && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => handleSelectEntry(entry.id, e.target.checked)}
                      />
                    </TableCell>
                  )}

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
                    <Typography variant="body2">
                      {entry.endTime ? formatLocalTime(entry.endTime) : (
                        <Chip label="Running" size="small" color="primary" />
                      )}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {entry.duration ? formatDuration(entry.duration) : '-'}
                    </Typography>
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
