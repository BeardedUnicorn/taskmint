/**
 * The session list's search box, status and source filters, and task chips.
 */

import {
  Box,
  Chip,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  TextField,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { SessionFilters, SourceFilter, StatusFilter } from './useSessionFilters';

export function SessionFilterBar({ filters }: { filters: SessionFilters }) {
  const { taskNames, taskFilters } = filters;
  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}>
        <TextField
          fullWidth
          label="Search sessions"
          placeholder="Search sessions..."
          value={filters.searchQuery}
          onChange={event => filters.setSearchQuery(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="session-status-label">Status</InputLabel>
          <Select
            labelId="session-status-label"
            value={filters.statusFilter}
            label="Status"
            onChange={(event: SelectChangeEvent) => filters.setStatusFilter(event.target.value as StatusFilter)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel id="session-source-label">Source</InputLabel>
          <Select
            labelId="session-source-label"
            value={filters.sourceFilter}
            label="Source"
            onChange={(event: SelectChangeEvent) => filters.setSourceFilter(event.target.value as SourceFilter)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="tracked">Tracked</MenuItem>
            <MenuItem value="imported">Imported</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {taskNames.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 3, flexWrap: 'wrap' }}>
          {taskNames.map(name => {
            const selected = taskFilters.includes(name);
            return (
              <Chip
                key={name}
                label={name}
                size="small"
                clickable
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                onClick={() => filters.toggleTask(name)}
              />
            );
          })}
          {taskFilters.length > 0 && <Chip label="Clear" size="small" onClick={filters.clearTaskFilters} />}
        </Stack>
      )}
    </>
  );
}
