import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { useBackupSettings } from '../hooks/useBackupSettings';
import { isTauriEnvironment } from '../utils/tauri';

type BackupSettingsContextValue = ReturnType<typeof useBackupSettings>;

const BackupSettingsContext = createContext<BackupSettingsContextValue | null>(null);

// Backups run at most daily, so an hourly due-check keeps each one within an
// hour of its scheduled time.
export const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Single owner of the automatic-backup settings, mounted for the whole app so
 * scheduled backups run whichever page is open. The Settings page reads and
 * edits the same instance (a second useBackupSettings() would hold its own
 * copy of the config and drift from this one).
 */
export function BackupSettingsProvider({ children }: { children: ReactNode }) {
  const backup = useBackupSettings();

  // Latest closure without re-arming the interval on every config change.
  const runIfDueRef = useRef(backup.performAutomaticBackupIfDue);
  useEffect(() => {
    runIfDueRef.current = backup.performAutomaticBackupIfDue;
  });

  const inFlightRef = useRef(false);
  const { enabled, backupPath } = backup.config;

  useEffect(() => {
    if (!isTauriEnvironment()) return;

    const check = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await runIfDueRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    // On launch, and right away when backups are switched on or pointed at a
    // new folder; then hourly.
    void check();
    const interval = setInterval(() => void check(), BACKUP_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, backupPath]);

  return (
    <BackupSettingsContext.Provider value={backup}>
      {children}
    </BackupSettingsContext.Provider>
  );
}

export function useBackupSettingsContext(): BackupSettingsContextValue {
  const context = useContext(BackupSettingsContext);
  if (!context) {
    throw new Error('useBackupSettingsContext must be used within a BackupSettingsProvider');
  }
  return context;
}
