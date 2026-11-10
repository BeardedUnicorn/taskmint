import { useState } from 'react';
import { getBackend } from '../backend';
import { reloadApp } from '../utils/appReload';
import { flushAppRecords } from '../services/appRecords';
import { getCloudSync } from '../cloud';

interface UseResetAppDataProps {
  onError?: (error: string) => void;
}

/**
 * Full app-data reset: wipes the backend's data (sessions, work logs, the
 * tasks/notes/templates/goal records, cloud sync's link, and on the desktop
 * their on-disk backups and tray/timer state), signs out of cloud sync (the
 * cloud's copy stays), then clears localStorage (settings) and reloads the
 * app so every provider re-initializes from the empty stores.
 */
export const useResetAppData = ({ onError }: UseResetAppDataProps = {}) => {
  const [isResetting, setIsResetting] = useState(false);

  const resetAllData = async () => {
    if (isResetting) return;
    setIsResetting(true);

    try {
      // A record write still in flight must land before the wipe, not after
      await flushAppRecords();
      // A backend failure aborts the reset before any local data is cleared
      const summary = await getBackend().call('reset_all_app_data');
      if (summary?.warning) {
        console.warn(summary.warning);
      }

      // The device stopped syncing with the reset; signed in, it would start
      // again at once and bring the cloud's data back
      await getCloudSync()?.signOut();
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
