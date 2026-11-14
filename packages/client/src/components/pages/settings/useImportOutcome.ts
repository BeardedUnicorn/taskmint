import { useMemo } from 'react';
import { getBackend } from '../../../backend';
import { getCloudSync } from '../../../cloud';
import { useNotification } from '../../../contexts/NotificationContext';
import type { ImportResult } from '../../../hooks/useDataBackup';
import { flushAppRecords } from '../../../services/appRecords';
import { reloadApp } from '../../../utils/appReload';
import { errorMessage } from '../../../utils/errors';

/**
 * What an import or a restore does once it has run: says so and reloads, so
 * every provider (tasks, sessions, work logs, notes, settings) reads the
 * restored data, once pending record writes have landed; or says why not.
 *
 * Where the data is only in the cloud (the web app), the page it reloads
 * into reads it from there, so the reload also waits until the cloud has it.
 * If the cloud doesn't take it, the page stays (it alone has the data) and
 * says so, with a way to try again.
 */
export function useImportOutcome() {
  const { notify, showError } = useNotification();
  return useMemo(() => {
    const reloadOnceInTheCloud = async (): Promise<void> => {
      await flushAppRecords();
      try {
        await getCloudSync()?.flush();
      } catch (error) {
        notify({
          severity: 'error',
          category: 'settings',
          title: 'Not saved to your account yet',
          message: `It’s only on this page so far: keep the page open, and try again before closing or reloading it. ${errorMessage(error, 'The cloud didn’t take it.')}`,
          actions: [{ label: 'Try again', onClick: reloadOnceInTheCloud }],
          duration: null,
          history: false,
        });
        return;
      }
      reloadApp();
    };

    return {
      onImportSuccess: (result: ImportResult) => {
        const done = result.mode === 'replace' ? 'Backup restored' : 'Data imported';
        const inTheCloud = getBackend().capabilities.dataLocation === 'cloud';
        notify({
          severity: 'success',
          category: 'settings',
          message: inTheCloud ? `${done}. Saving it to your account, then reloading…` : `${done}. Reloading…`,
          // Sending it can take a while (or wait for a connection): it stays until the reload
          ...(inTheCloud ? { duration: null } : {}),
          history: false,
        });
        if (inTheCloud) void reloadOnceInTheCloud();
        else void flushAppRecords().finally(reloadApp);
      },
      onImportError: (error: unknown) => {
        showError(errorMessage(error, "Couldn't import that file"));
      },
    };
  }, [notify, showError]);
}
