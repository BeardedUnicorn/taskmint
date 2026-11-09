/**
 * Saves a CSV wherever the platform saves files (the desktop's Save dialog).
 * Cancelling is silent.
 */

import { useCallback, useState } from 'react';
import { getBackend } from '../backend';
import { useNotification } from '../contexts/NotificationContext';
import { errorMessage } from '../utils/errors';
import { revealAction } from '../utils/reveal';

export function useCsvExport() {
  const { showSuccess, showError } = useNotification();
  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = useCallback(
    async (csv: string, fileName: string) => {
      setIsExporting(true);
      try {
        const saved = await getBackend().platform.files.save({ contents: csv, suggestedName: fileName, format: 'csv' });
        if (saved?.kind === 'path') {
          showSuccess(`Saved to ${saved.path}`, { category: 'export', actions: revealAction(saved.path) });
        } else if (saved?.kind === 'download') {
          showSuccess(`Downloaded ${saved.name}`, { category: 'export' });
        } else if (saved) {
          showSuccess('Saved the CSV', { category: 'export' });
        }
      } catch (err) {
        showError(`Couldn't export the CSV: ${errorMessage(err, 'Unknown error')}`);
      } finally {
        setIsExporting(false);
      }
    },
    [showError, showSuccess]
  );

  return { exportCsv, isExporting };
}
