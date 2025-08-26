import React from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
} from '@mui/material';
import type { TextFieldProps } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface SearchListHeaderProps {
  title: React.ReactNode;
  actions?: React.ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchFieldProps?: TextFieldProps;
}

export function SearchListHeader({
  title,
  actions,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchFieldProps,
}: SearchListHeaderProps) {
  const {
    InputProps: inputProps,
    inputProps: inputElementProps,
    fullWidth,
    ...rest
  } = searchFieldProps || {};

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
        onChange={(e) => onSearchChange(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          ...inputProps,
        }}
        inputProps={{
          'aria-label':
            inputElementProps?.['aria-label'] ??
            searchPlaceholder.replace(/\.\.\.$/, ''),
          ...inputElementProps,
        }}
        fullWidth={fullWidth ?? true}
        {...rest}
      />
    </Box>
  );
}

