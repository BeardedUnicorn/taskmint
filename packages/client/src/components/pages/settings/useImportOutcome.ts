import { useMemo } from 'react';
import { useNotification } from '../../../contexts/NotificationContext';
import type { ImportResult } from '../../../hooks/useDataBackup';
import { flushAppRecords } from '../../../services/appRecords';
import { reloadApp } from '../../../utils/appReload';
import { errorMessage } from '../../../utils/errors';

/**
 * What an import or a restore does once it has run: says so and reloads, so
 * every provider (tasks, sessions, work logs, notes, settings) reads the
 * restored data, once pending record writes have landed; or says why not.
 */
export function useImportOutcome() {
  const { notify, showError } = useNotification();
  return useMemo(
    () => ({
      onImportSuccess: (result: ImportResult) => {
        notify({
          severity: 'success',
          category: 'settings',
          message: result.mode === 'replace' ? 'Backup restored. Reloading…' : 'Data imported. Reloading…',
          history: false,
        });
        void flushAppRecords().finally(reloadApp);
      },
      onImportError: (error: unknown) => {
        showError(errorMessage(error, "Couldn't import that file"));
      },
    }),
    [notify, showError]
  );
}
