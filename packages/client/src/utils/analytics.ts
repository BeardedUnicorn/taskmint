/**
 * Usage analytics (Firebase Analytics), where the shell has them: the web
 * app and the Android app; the desktop has none. What goes is which pages
 * are opened, never task names, notes, earnings or work logs. Settings →
 * Privacy turns it off for this device.
 */

import { useEffect } from 'react';
import { getBackend } from '../backend';
import { STORAGE_KEYS } from '../constants';
import { useNavigation } from '../contexts/NavigationContext';

export function isAnalyticsEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEYS.ANALYTICS_ENABLED) !== 'false';
}

/** Saves the choice and applies it at once. */
export function setAnalyticsEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.ANALYTICS_ENABLED, String(enabled));
  getBackend().platform.analytics?.setEnabled(enabled);
}

/** The shell's analytics follow the saved choice, and each page opened is a screen view. */
export function useAnalyticsScreens(): void {
  const { view } = useNavigation();
  useEffect(() => {
    getBackend().platform.analytics?.setEnabled(isAnalyticsEnabled());
  }, []);
  useEffect(() => {
    if (isAnalyticsEnabled()) getBackend().platform.analytics?.screen(view);
  }, [view]);
}
