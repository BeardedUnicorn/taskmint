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
  Snackbar,
} from '@mui/material';
import {
  Download as DownloadIcon,
  // Add as AddIcon, // Commented out unused import
} from '@mui/icons-material';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { EditTimeEntryData } from '../../types/form';
import { TimeEntriesTable, SortField, SortDirection } from '../ui/tables/TimeEntriesTable';
import {
  TimeEntriesFilters,
  TimeEntriesFiltersState,
  defaultFilters,
  applyTimeEntriesFilters,
} from '../ui/filters/TimeEntriesFilters';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { ConfirmDialog } from '../ui/dialogs/ConfirmDialog';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { getEntryElapsedMs } from '../../utils/timerHelpers';

interface TimeEntriesPageProps {
  timeEntries: TimeEntry[];
  tasks: Task[];
  onUpdateEntry: (data: EditTimeEntryData) => void;
  onDeleteEntry: (entryId: string) => void;
  onBulkDeleteEntries?: (entryIds: string[]) => void;
  onExportEntries?: (entries: TimeEntry[]) => void;
}

const ENTRIES_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function TimeEntriesPage({
  timeEntries,
  tasks,
  onUpdateEntry,
  onDeleteEntry,
  onBulkDeleteEntries,
  onExportEntries,
}: TimeEntriesPageProps) {
  // State management
  const [filters, setFilters] = useLocalStorage<TimeEntriesFiltersState>(
    'timeEntriesFilters',
    defaultFilters
  );
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

  // Apply filters and sorting
  const filteredEntries = useMemo(() => {
    return applyTimeEntriesFilters(timeEntries, filters);
  }, [timeEntries, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const paginatedEntries = filteredEntries.slice(startIndex, endIndex);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Event handlers
  const handleFiltersChange = (newFilters: TimeEntriesFiltersState) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters);
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

  const handleExport = () => {
    if (onExportEntries) {
      onExportEntries(filteredEntries);
      setNotification({
        open: true,
        message: 'Time entries exported successfully',
        severity: 'success',
      });
    }
  };

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
            Time Entries
          </Typography>
          <Typography variant="body1" color="text.secondary">
            View and manage all your time entries with advanced filtering and sorting
          </Typography>
        </Box>

        <Stack direction="row" spacing={2}>
          {onExportEntries && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              disabled={filteredEntries.length === 0}
            >
              Export ({filteredEntries.length})
            </Button>
          )}
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
      />

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
