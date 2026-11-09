/**
 * A phone's status bar sits over the top of the app (Android draws the app
 * edge to edge), so its clock and icons follow the app's own light or dark
 * theme, not the system's. Elsewhere the platform has no status bar to set.
 */

import { useEffect } from 'react';
import { getBackend } from '../backend';
import { useTheme } from '../contexts/ThemeContext';

export function useSystemBarsTheme(): void {
  const { isDark } = useTheme();

  useEffect(() => {
    getBackend().platform.systemBars?.setTheme(isDark ? 'dark' : 'light');
  }, [isDark]);
}
