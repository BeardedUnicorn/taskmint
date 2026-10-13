import type { ReactNode } from 'react';
import { Box, Button } from '@mui/material';
import { LightMode, DarkMode, Computer } from '@mui/icons-material';
import { useTheme, type ThemeMode } from '../../../contexts/ThemeContext';

const OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <LightMode fontSize="small" /> },
  { value: 'dark', label: 'Dark', icon: <DarkMode fontSize="small" /> },
  { value: 'system', label: 'System', icon: <Computer fontSize="small" /> },
];

/** Light / Dark / System, as a row of buttons with the current one filled. */
export function ThemeSelector() {
  const { mode, setMode } = useTheme();
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {OPTIONS.map(option => (
        <Button
          key={option.value}
          onClick={() => setMode(option.value)}
          variant={mode === option.value ? 'contained' : 'outlined'}
          startIcon={option.icon}
          aria-pressed={mode === option.value}
        >
          {option.label}
        </Button>
      ))}
    </Box>
  );
}
