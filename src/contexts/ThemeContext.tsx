/**
 * Theme Context Provider
 * 
 * This context provides theme switching functionality between light and dark modes
 * with persistence and system preference detection.
 */

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, Theme } from '@mui/material/styles';
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

export default ThemeProvider;
