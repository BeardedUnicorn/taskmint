import React from 'react';
import { Box, Typography, TextField, InputAdornment } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface SearchListHeaderProps {
  title: string;
  actions: React.ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Also the field's accessible name, without its trailing "..." */
  searchPlaceholder: string;
}

/** A list's title and actions above a search field. */
export function SearchListHeader({
  title,
  actions,
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: SearchListHeaderProps) {
  return (
    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {actions}
      </Box>
      <TextField
        size="small"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
          htmlInput: { 'aria-label': searchPlaceholder.replace(/\.\.\.$/, '') },
        }}
      />
    </Box>
  );
}
