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
    slotProps: slotPropsOverride,
    fullWidth,
    ...rest
  } = searchFieldProps || {};
  const inputOverride = (slotPropsOverride?.input ?? {}) as object;
  const htmlInputOverride = (slotPropsOverride?.htmlInput ?? {}) as Record<string, unknown>;

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
        fullWidth={fullWidth ?? true}
        {...rest}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            ...inputOverride,
          },

          htmlInput: {
            'aria-label':
              (htmlInputOverride['aria-label'] as string | undefined) ??
              searchPlaceholder.replace(/\.\.\.$/, ''),
            ...htmlInputOverride,
          }
        }} />
    </Box>
  );
}

