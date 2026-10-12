/**
 * History Page
 *
 * Every tracked, added and imported entry in one place (it replaced the
 * separate Reports and Time Entries pages): filters with quick ranges, a
 * summary, charts, the sortable entries table with edit / delete / CSV, and
 * the daily goal's results over the range.
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Stack,
  Button,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Paper,
  Snackbar,
} from '@mui/material';
import {
  Download as DownloadIcon,
  MoreTime as AddTimeIcon,
} from '@mui/icons-material';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { EditTimeEntryData } from '../../../types/form';
import { TimeEntriesTable, SortField, SortDirection, sortTimeEntries } from '../../ui/tables/TimeEntriesTable';
import {
  TimeEntriesFilters,
  TimeEntriesFiltersState,
  defaultFilters,
  applyTimeEntriesFilters,
  hydrateTimeEntriesFilters,
} from '../../ui/filters/TimeEntriesFilters';
import { useCsvExport } from '../../../hooks/useCsvExport';
import { csvFileName, exportableEntries, timeEntriesToCsv } from '../../../utils/csvExport';
import { EditTimeEntryDialog } from '../../ui/dialogs/EditTimeEntryDialog';
import { ConfirmDialog } from '../../ui/dialogs/ConfirmDialog';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import { getEntryElapsedMs } from '../../../utils/timerHelpers';
import { DateRangePreset } from '../../../utils/dateRanges';
import { buildGoalHistory } from '../../../utils/goalHistory';
import { useDailyGoals } from '../../../hooks/useDailyGoals';
import { GoalAchievementsTable } from '../../ui/tables/GoalAchievementsTable';
import { HistorySummary } from './HistorySummary';
import { HistoryCharts } from './HistoryCharts';

/** The range History opens on until you choose another. */
const DEFAULT_DATE_PRESET: DateRangePreset = 'last7';
const DEFAULT_FILTERS: TimeEntriesFiltersState = { ...defaultFilters, datePreset: DEFAULT_DATE_PRESET };

interface HistoryPageProps {
  timeEntries: TimeEntry[];
  tasks: Task[];
  onUpdateEntry: (data: EditTimeEntryData) => void;
  onDeleteEntry: (entryId: string) => void;
  onBulkDeleteEntries?: (entryIds: string[]) => void;
  /** Opens the Add Time dialog (time logged after the fact). */
  onAddTime?: () => void;
}

const ENTRIES_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function HistoryPage({
  timeEntries,
  tasks,
  onUpdateEntry,
  onDeleteEntry,
  onBulkDeleteEntries,
  onAddTime,
}: HistoryPageProps) {
  // State management (the key predates History: Time Entries' saved filters carry over)
  const [storedFilters, setFilters] = useLocalStorage<TimeEntriesFiltersState>(
    'timeEntriesFilters',
    DEFAULT_FILTERS
  );
  // Saved dates come back as text and saved tasks as stale copies
  const filters = useMemo(
    () => hydrateTimeEntriesFilters(storedFilters, tasks),
    [storedFilters, tasks]
  );
  const { exportCsv, isExporting } = useCsvExport();
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sortField, setSortField] = useLocalStorage<SortField>('timeEntriesSortField', 'startTime');
  const [sortDirection, setSortDirection] = useLocalStorage<SortDirection>('timeEntriesSortDirection', 'desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useLocalStorage('timeEntriesPerPage', 25);
  
  // Dialog states
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [bulkDeletingIds, setBulkDeletingIds] = useState<string[]>([]);
  
  // Notification state
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Filter, then sort the whole list, then paginate — sorting after the
  // slice would only order the visible page.
  const filteredEntries = useMemo(() => {
    return applyTimeEntriesFilters(timeEntries, filters);
  }, [timeEntries, filters]);

  const sortedEntries = useMemo(
    () => sortTimeEntries(filteredEntries, tasks, sortField, sortDirection),
    [filteredEntries, tasks, sortField, sortDirection]
  );

  // Pagination
  const totalPages = Math.ceil(sortedEntries.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const paginatedEntries = sortedEntries.slice(startIndex, endIndex);

  // Back to the first page when the filters or the sort change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [storedFilters, sortField, sortDirection]);

  // Event handlers
  const handleFiltersChange = (newFilters: TimeEntriesFiltersState) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleSort = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEdit = (data: EditTimeEntryData) => {
    if (!editingEntry) return;

    onUpdateEntry(data);
    setEditingEntry(null);
    setNotification({
      open: true,
      message: 'Time entry updated successfully',
      severity: 'success',
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    setDeletingEntryId(entryId);
  };

  const handleConfirmDelete = () => {
    if (deletingEntryId) {
      onDeleteEntry(deletingEntryId);
      setDeletingEntryId(null);
      setNotification({
        open: true,
        message: 'Time entry deleted successfully',
        severity: 'success',
      });
    }
  };

  const handleBulkDelete = (entryIds: string[]) => {
    setBulkDeletingIds(entryIds);
  };

  const handleConfirmBulkDelete = () => {
    if (onBulkDeleteEntries && bulkDeletingIds.length > 0) {
      onBulkDeleteEntries(bulkDeletingIds);
      setBulkDeletingIds([]);
      setNotification({
        open: true,
        message: `${bulkDeletingIds.length} time entries deleted successfully`,
        severity: 'success',
      });
    }
  };

  // Finished entries (a running timer has no end yet): the summary, charts and CSV
  const finishedEntries = useMemo(() => exportableEntries(filteredEntries), [filteredEntries]);

  // The goal's day results over the range (all tasks): each day's saved
  // target, earnings recomputed from tracked time so edits and imports count.
  const { achievements, currentGoal } = useDailyGoals();
  const goalHistory = useMemo(
    () =>
      buildGoalHistory({
        startDate: filters.startDate ? filters.startDate.format('YYYY-MM-DD') : '0000-01-01',
        endDate: filters.endDate ? filters.endDate.format('YYYY-MM-DD') : '9999-12-31',
        timeEntries,
        tasks,
        records: achievements,
        currentGoal,
      }),
    [filters.startDate, filters.endDate, timeEntries, tasks, achievements, currentGoal]
  );
  const handleExport = () =>
    exportCsv(
      timeEntriesToCsv(finishedEntries, tasks),
      csvFileName(finishedEntries, filters.startDate, filters.endDate)
    );

  const handlePageChange = (_: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
  };

  const handleEntriesPerPageChange = (event: any) => {
    setEntriesPerPage(event.target.value);
    setCurrentPage(1);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
            History
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Everything you've tracked, added and imported, with totals and charts
          </Typography>
        </Box>

        <Stack direction="row" spacing={2}>
          {onAddTime && (
            <Button variant="contained" startIcon={<AddTimeIcon />} onClick={onAddTime}>
              Add time
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={finishedEntries.length === 0 || isExporting}
          >
            Export CSV ({finishedEntries.length})
          </Button>
        </Stack>
      </Stack>

      {/* Filters */}
      <TimeEntriesFilters
        filters={filters}
        tasks={tasks}
        onFiltersChange={handleFiltersChange}
        onClearFilters={handleClearFilters}
        isExpanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        defaultDatePreset={DEFAULT_DATE_PRESET}
      />

      <HistorySummary entries={finishedEntries} tasks={tasks} />
      <HistoryCharts entries={finishedEntries} tasks={tasks} />

      {/* Results Summary */}
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
      >
        <Typography variant="body2" color="text.secondary">
          Showing {startIndex + 1}-{Math.min(endIndex, filteredEntries.length)} of {filteredEntries.length} entries
          {filteredEntries.length !== timeEntries.length && (
            <> (filtered from {timeEntries.length} total)</>
          )}
        </Typography>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Per page</InputLabel>
          <Select
            value={entriesPerPage}
            label="Per page"
            onChange={handleEntriesPerPageChange}
          >
            {ENTRIES_PER_PAGE_OPTIONS.map(option => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {/* Time Entries Table */}
      <TimeEntriesTable
        entries={paginatedEntries}
        tasks={tasks}
        onEdit={handleEditEntry}
        onDelete={handleDeleteEntry}
        onBulkDelete={onBulkDeleteEntries ? handleBulkDelete : undefined}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        showBulkActions={!!onBulkDeleteEntries}
        showEarnings={true}
        showNotes={false}
        maxHeight={600}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* Daily goal results over the range */}
      {(currentGoal?.isEnabled || goalHistory.length > 0) && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Daily goal
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            How each day in the range did against its goal
          </Typography>
          <GoalAchievementsTable achievements={goalHistory} />
        </Paper>
      )}

      {/* Edit Dialog */}
      {editingEntry && (
        <EditTimeEntryDialog
          open={true}
          entry={{
            id: editingEntry.id,
            taskName: editingEntry.taskName,
            durationMs: getEntryElapsedMs(editingEntry),
            startTime: editingEntry.startTime
              ? new Date(editingEntry.startTime).toISOString()
              : undefined,
          }}
          onSave={handleSaveEdit}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingEntryId}
        title="Delete Time Entry"
        message="Are you sure you want to delete this time entry? This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingEntryId(null)}
        onCancel={() => setDeletingEntryId(null)}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={bulkDeletingIds.length > 0}
        title="Delete Multiple Time Entries"
        message={`Are you sure you want to delete ${bulkDeletingIds.length} time entries? This action cannot be undone.`}
        confirmLabel="Delete All"
        confirmColor="error"
        onConfirm={handleConfirmBulkDelete}
        onClose={() => setBulkDeletingIds([])}
        onCancel={() => setBulkDeletingIds([])}
      />

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification(prev => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setNotification(prev => ({ ...prev, open: false }))}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
