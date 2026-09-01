import { useState } from 'react';
import { isTauriEnvironment } from '../utils/tauri';
import { reloadApp } from '../utils/appReload';

/** Result of the Rust reset_all_app_data command. */
export interface ResetAppDataSummary {
  backupsDeleted: number;
  warning: string | null;
}

interface UseResetAppDataProps {
  onError?: (error: string) => void;
}

/**
 * Full app-data reset: wipes the Rust stores (sessions, work logs, their
 * on-disk backups, tray/timer state), then clears localStorage (tasks, notes,
 * templates, goals, settings) and reloads the app so every provider
 * re-initializes from the empty stores.
 */
export const useResetAppData = ({ onError }: UseResetAppDataProps = {}) => {
  const [isResetting, setIsResetting] = useState(false);

  const resetAllData = async () => {
    if (isResetting) return;
    setIsResetting(true);

    try {
      if (isTauriEnvironment()) {
        // Direct invoke rather than safeInvoke: a backend failure must abort
        // the reset before any frontend data is cleared.
        const { invoke } = await import('@tauri-apps/api/core');
        const summary = await invoke<ResetAppDataSummary>('reset_all_app_data');
        if (summary?.warning) {
          console.warn(summary.warning);
        }
      }

      window.localStorage.clear();
      reloadApp();
      // Deliberately leave isResetting true: the page is about to unload, and
      // the button must stay disabled until it does.
    } catch (error) {
      console.error('Failed to reset app data:', error);
      setIsResetting(false);
      onError?.('Failed to reset app data. Please try again.');
    }
  };

  return { resetAllData, isResetting };
};
