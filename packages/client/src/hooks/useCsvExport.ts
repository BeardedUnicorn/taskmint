/**
 * Saves a CSV: through the app's Save dialog on the desktop, or as a browser
 * download in the web preview. Cancelling the dialog is silent.
 */

import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNotification } from '../contexts/NotificationContext';
import { errorMessage } from '../utils/errors';
import { isTauriEnvironment } from '../utils/tauri';
import { revealAction } from '../utils/reveal';

/** Paired with EXPORT_CANCELLED in apps/desktop/src-tauri/src/commands/backup.rs. */
export const EXPORT_CANCELLED = 'Export cancelled by user';

function downloadInBrowser(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function useCsvExport() {
  const { showSuccess, showError } = useNotification();
  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = useCallback(
    async (csv: string, fileName: string) => {
      setIsExporting(true);
      try {
        if (isTauriEnvironment()) {
          const path = await invoke<string>('export_csv_file', { csv, suggestedFilename: fileName });
          showSuccess(`Saved to ${path}`, { category: 'export', actions: revealAction(path) });
        } else {
          downloadInBrowser(csv, fileName);
          showSuccess(`Downloaded ${fileName}`, { category: 'export' });
        }
      } catch (err) {
        const message = errorMessage(err, 'Unknown error');
        if (message !== EXPORT_CANCELLED) {
          showError(`Couldn't export the CSV: ${message}`);
        }
      } finally {
        setIsExporting(false);
      }
    },
    [showError, showSuccess]
  );

  return { exportCsv, isExporting };
}
