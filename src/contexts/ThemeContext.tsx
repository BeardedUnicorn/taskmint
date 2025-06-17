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
  
  return (
    <button
      onClick={toggleTheme}
      className={className}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: size === 'small' ? '4px' : size === 'large' ? '12px' : '8px',
        borderRadius: '4px',
        transition: 'background-color 0.2s',
      }}
    >
      <span style={{ fontSize: size === 'small' ? '16px' : size === 'large' ? '24px' : '20px' }}>
        {isDark ? '☀️' : '🌙'}
      </span>
      {showLabel && (
        <span style={{ fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px' }}>
          {isDark ? 'Light' : 'Dark'}
        </span>
      )}
    </button>
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
  
  if (variant === 'buttons') {
    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => setMode(option.value)}
            style={{
              background: currentMode === option.value ? 'rgba(144, 202, 249, 0.2)' : 'none',
              border: '1px solid rgba(144, 202, 249, 0.5)',
              borderRadius: '4px',
              padding: size === 'small' ? '4px 8px' : size === 'large' ? '12px 16px' : '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px',
            }}
          >
            <span>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    );
  }
  
  // Default menu variant
  return (
    <div>
      {options.map((option) => (
        <div
          key={option.value}
          onClick={() => setMode(option.value)}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: currentMode === option.value ? 'rgba(144, 202, 249, 0.1)' : 'none',
          }}
        >
          <span>{option.icon}</span>
          <span>{option.label}</span>
          {currentMode === option.value && <span style={{ marginLeft: 'auto' }}>✓</span>}
        </div>
      ))}
    </div>
  );
}

export default ThemeProvider;
