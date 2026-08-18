// import React from 'react'; // Commented out unused import
import {
  Box,
  Stack,
  TextField,
  Autocomplete,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Paper,
  Collapse,
  IconButton,
  // Grid, // Removed unused import
} from '@mui/material';
import {
  FilterList as FilterIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { Task } from '../../../types/task';
import dayjs, { Dayjs } from 'dayjs';

export interface TimeEntriesFiltersState {
  searchQuery: string;
  selectedTasks: Task[];
  startDate: Dayjs | null;
  endDate: Dayjs | null;
  minDuration: number | null; // in minutes
  maxDuration: number | null; // in minutes
  status: 'all' | 'completed' | 'running';
}

export interface TimeEntriesFiltersProps {
  filters: TimeEntriesFiltersState;
  tasks: Task[];
  onFiltersChange: (filters: TimeEntriesFiltersState) => void;
  onClearFilters: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export function TimeEntriesFilters({
  filters,
  tasks,
  onFiltersChange,
  onClearFilters,
  isExpanded = false,
  onToggleExpanded,
}: TimeEntriesFiltersProps) {
  const updateFilters = (updates: Partial<TimeEntriesFiltersState>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const hasActiveFilters = 
    filters.searchQuery ||
    filters.selectedTasks.length > 0 ||
    filters.startDate ||
    filters.endDate ||
    filters.minDuration !== null ||
    filters.maxDuration !== null ||
    filters.status !== 'all';

  const activeFiltersCount = [
    filters.searchQuery,
    filters.selectedTasks.length > 0,
    filters.startDate,
    filters.endDate,
    filters.minDuration !== null,
    filters.maxDuration !== null,
    filters.status !== 'all',
  ].filter(Boolean).length;

  return (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      {/* Filter Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FilterIcon color="action" />
            <Typography variant="h6">
              Filters
            </Typography>
            {activeFiltersCount > 0 && (
              <Chip
                label={`${activeFiltersCount} active`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {hasActiveFilters && (
              <IconButton
                size="small"
                onClick={onClearFilters}
                title="Clear all filters"
              >
                <ClearIcon />
              </IconButton>
            )}
            
            {onToggleExpanded && (
              <IconButton
                size="small"
                onClick={onToggleExpanded}
                title={isExpanded ? "Collapse filters" : "Expand filters"}
              >
                {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* Quick Filters (Always Visible) */}
      <Box sx={{ p: 2 }}>
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          alignItems: { md: 'center' }
        }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <TextField
              fullWidth
              size="small"
              label="Search tasks"
              value={filters.searchQuery}
              onChange={(e) => updateFilters({ searchQuery: e.target.value })}
              placeholder="Type to search..."
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 200 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                label="Status"
                onChange={(e) => updateFilters({ status: e.target.value as any })}
              >
                <MenuItem value="all">All Entries</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="running">Running</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Autocomplete
              multiple
              size="small"
              options={tasks}
              getOptionLabel={(task) => task.name}
              value={filters.selectedTasks}
              onChange={(_, newValue) => updateFilters({ selectedTasks: newValue })}
              renderValue={(value, getItemProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option.name}
                    size="small"
                    {...getItemProps({ index })}
                    key={option.id}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Filter by tasks"
                  placeholder="Select tasks..."
                />
              )}
            />
          </Box>
        </Box>
      </Box>

      {/* Advanced Filters (Collapsible) */}
      <Collapse in={isExpanded}>
        <Box sx={{ p: 2, pt: 0, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Advanced Filters
          </Typography>

          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              flexWrap: 'wrap'
            }}>
              {/* Date Range */}
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <DatePicker
                  label="Start Date"
                  value={filters.startDate}
                  onChange={(date) => updateFilters({ startDate: date as Dayjs | null })}
                  slotProps={{
                    textField: {
                      size: 'small',
                      fullWidth: true,
                    },
                  }}
                />
              </Box>

              <Box sx={{ flex: 1, minWidth: 200 }}>
                <DatePicker
                  label="End Date"
                  value={filters.endDate}
                  onChange={(date) => updateFilters({ endDate: date as Dayjs | null })}
                  minDate={filters.startDate || undefined}
                  slotProps={{
                    textField: {
                      size: 'small',
                      fullWidth: true,
                    },
                  }}
                />
              </Box>

              {/* Duration Range */}
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Min Duration (minutes)"
                  value={filters.minDuration || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : null;
                    updateFilters({ minDuration: value });
                  }}
                  slotProps={{
                    htmlInput: { min: 0 }
                  }}
                />
              </Box>

              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Max Duration (minutes)"
                  value={filters.maxDuration || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : null;
                    updateFilters({ maxDuration: value });
                  }}
                  slotProps={{
                    htmlInput: { min: filters.minDuration || 0 }
                  }}
                />
              </Box>
            </Box>
          </LocalizationProvider>
        </Box>
      </Collapse>
    </Paper>
  );
}

// Default filter state
export const defaultFilters: TimeEntriesFiltersState = {
  searchQuery: '',
  selectedTasks: [],
  startDate: null,
  endDate: null,
  minDuration: null,
  maxDuration: null,
  status: 'all',
};

// Helper function to apply filters to time entries
export function applyTimeEntriesFilters(
  entries: any[],
  filters: TimeEntriesFiltersState
): any[] {
  return entries.filter(entry => {
    // Search query filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      if (!entry.taskName.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Task filter
    if (filters.selectedTasks.length > 0) {
      const taskMatch = filters.selectedTasks.some(task =>
        task.id === entry.taskId || task.name === entry.taskName
      );
      if (!taskMatch) {
        return false;
      }
    }

    // Date range filter
    const entryDate = dayjs(entry.startTime);
    if (filters.startDate && entryDate.isBefore(filters.startDate, 'day')) {
      return false;
    }
    if (filters.endDate && entryDate.isAfter(filters.endDate, 'day')) {
      return false;
    }

    // Duration filter
    if (entry.duration) {
      const durationMinutes = entry.duration / (1000 * 60);
      if (filters.minDuration !== null && durationMinutes < filters.minDuration) {
        return false;
      }
      if (filters.maxDuration !== null && durationMinutes > filters.maxDuration) {
        return false;
      }
    }

    // Status filter
    if (filters.status === 'completed' && !entry.duration) {
      return false;
    }
    if (filters.status === 'running' && entry.duration) {
      return false;
    }

    return true;
  });
}
