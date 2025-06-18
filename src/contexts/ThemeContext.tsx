/**
 * Theme Context Provider
 * 
 * This context provides theme switching functionality between light and dark modes
 * with persistence and system preference detection.
 */

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, Theme } from '@mui/material/styles';
import { IconButton, Button, Box, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { LightMode, DarkMode, Computer, Check } from '@mui/icons-material';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { darkTheme, createLightTheme } from '../theme';

// Theme mode type
export type ThemeMode = 'light' | 'dark' | 'system';

// Theme context interface
interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  theme: Theme;
  systemTheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

// Create context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme provider props
interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

/**
 * Hook to use theme context
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Detect system theme preference
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // Default to dark if unable to detect
}

/**
 * Theme Provider Component
 */
export function ThemeProvider({ children, defaultMode = 'dark' }: ThemeProviderProps) {
  const [mode, setStoredMode] = useLocalStorage<ThemeMode>('theme-mode', defaultMode);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleChange = (e: MediaQueryListEvent) => {
        setSystemTheme(e.matches ? 'dark' : 'light');
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } 
      // Legacy browsers
      else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, []);

  // Determine actual theme based on mode
  const isDark = useMemo(() => {
    switch (mode) {
      case 'light':
        return false;
      case 'dark':
        return true;
      case 'system':
        return systemTheme === 'dark';
      default:
        return true;
    }
  }, [mode, systemTheme]);

  // Get the appropriate theme
  const theme = useMemo(() => {
    return isDark ? darkTheme : createLightTheme();
  }, [isDark]);

  // Set mode function
  const setMode = (newMode: ThemeMode) => {
    setStoredMode(newMode);
  };

  // Toggle between light and dark (ignores system mode)
  const toggleTheme = () => {
    if (mode === 'system') {
      // If currently on system, toggle to opposite of current system theme
      setMode(systemTheme === 'dark' ? 'light' : 'dark');
    } else {
      // Toggle between light and dark
      setMode(mode === 'dark' ? 'light' : 'dark');
    }
  };

  // Context value
  const contextValue: ThemeContextType = {
    mode,
    isDark,
    theme,
    systemTheme,
    setMode,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={theme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

/**
 * Hook to get theme mode display name
 */
export function useThemeDisplayName(): string {
  const { mode, systemTheme } = useTheme();
  
  switch (mode) {
    case 'light':
      return 'Light';
    case 'dark':
      return 'Dark';
    case 'system':
      return `System (${systemTheme === 'dark' ? 'Dark' : 'Light'})`;
    default:
      return 'Unknown';
  }
}

/**
 * Hook to get available theme options
 */
export function useThemeOptions() {
  const { mode, setMode } = useTheme();
  
  const options = [
    { value: 'light' as const, label: 'Light', icon: '☀️' },
    { value: 'dark' as const, label: 'Dark', icon: '🌙' },
    { value: 'system' as const, label: 'System', icon: '💻' },
  ];
  
  return {
    options,
    currentMode: mode,
    setMode,
  };
}

/**
 * Theme toggle button component
 */
export function ThemeToggleButton({
  size = 'medium',
  showLabel = false,
  className,
}: {
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  className?: string;
}) {
  const { isDark, toggleTheme } = useTheme();

  if (showLabel) {
    return (
      <Button
        onClick={toggleTheme}
        className={className}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        startIcon={isDark ? <LightMode /> : <DarkMode />}
        size={size}
        variant="outlined"
      >
        {isDark ? 'Light' : 'Dark'}
      </Button>
    );
  }

  return (
    <IconButton
      onClick={toggleTheme}
      className={className}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      size={size}
      color="inherit"
    >
      {isDark ? <LightMode /> : <DarkMode />}
    </IconButton>
  );
}

/**
 * Theme selector component
 */
export function ThemeSelector({
  variant = 'menu',
  size = 'medium',
}: {
  variant?: 'menu' | 'buttons' | 'dropdown';
  size?: 'small' | 'medium' | 'large';
}) {
  const { options, currentMode, setMode } = useThemeOptions();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const getIcon = (value: string) => {
    switch (value) {
      case 'light':
        return <LightMode fontSize="small" />;
      case 'dark':
        return <DarkMode fontSize="small" />;
      case 'system':
        return <Computer fontSize="small" />;
      default:
        return null;
    }
  };

  if (variant === 'buttons') {
    return (
      <Box display="flex" gap={1}>
        {options.map((option) => (
          <Button
            key={option.value}
            onClick={() => setMode(option.value)}
            variant={currentMode === option.value ? 'contained' : 'outlined'}
            size={size}
            startIcon={getIcon(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </Box>
    );
  }

  if (variant === 'dropdown') {
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
      setAnchorEl(null);
    };

    const handleSelect = (value: string) => {
      setMode(value as any);
      handleClose();
    };

    const currentOption = options.find(opt => opt.value === currentMode);

    return (
      <>
        <Button
          onClick={handleClick}
          variant="outlined"
          size={size}
          startIcon={getIcon(currentMode)}
          aria-controls={Boolean(anchorEl) ? 'theme-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={Boolean(anchorEl) ? 'true' : undefined}
        >
          {currentOption?.label}
        </Button>
        <Menu
          id="theme-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          MenuListProps={{
            'aria-labelledby': 'theme-button',
          }}
        >
          {options.map((option) => (
            <MenuItem
              key={option.value}
              onClick={() => handleSelect(option.value)}
              selected={currentMode === option.value}
            >
              <ListItemIcon>
                {getIcon(option.value)}
              </ListItemIcon>
              <ListItemText>{option.label}</ListItemText>
              {currentMode === option.value && (
                <Check fontSize="small" sx={{ ml: 1 }} />
              )}
            </MenuItem>
          ))}
        </Menu>
      </>
    );
  }

  // Default menu variant - render as simple menu items
  return (
    <Box>
      {options.map((option) => (
        <MenuItem
          key={option.value}
          onClick={() => setMode(option.value)}
          selected={currentMode === option.value}
        >
          <ListItemIcon>
            {getIcon(option.value)}
          </ListItemIcon>
          <ListItemText>{option.label}</ListItemText>
          {currentMode === option.value && (
            <Check fontSize="small" sx={{ ml: 1 }} />
          )}
        </MenuItem>
      ))}
    </Box>
  );
}

export default ThemeProvider;
