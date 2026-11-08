import { useState } from 'react';
import {
  Typography,
  Button,
  Stack,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Box,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Upload as UploadIcon,
  Storage as DataIcon,
  DeleteForever as ResetIcon,
} from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useDataBackup } from '../../../hooks/useDataBackup';
import { useResetAppData } from '../../../hooks/useResetAppData';
import { reloadApp } from '../../../utils/appReload';
import { flushAppRecords } from '../../../services/appRecords';
import { useNotification } from '../../../contexts/NotificationContext';
import { errorMessage } from '../../../utils/errors';
import { revealAction } from '../../../utils/reveal';

// Typed confirmation guarding the full app-data reset.
export const RESET_CONFIRMATION_WORD = 'RESET';

export function DataManagementSection() {
  const { notify, showError } = useNotification();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const { exportData, importData, isExporting, isImporting } = useDataBackup({
    onExportSuccess: (path?: string) => {
      notify({
        severity: 'success',
        category: 'export',
        message: path ? `Exported to ${path}` : 'Your data was exported',
        actions: revealAction(path),
      });
    },
    onExportError: (error: unknown) => {
      showError(errorMessage(error, "Couldn't export your data"));
    },
    onImportSuccess: () => {
      notify({ severity: 'success', category: 'settings', message: 'Data imported. Reloading…', history: false });
      // Every provider (tasks, sessions, work logs, notes) re-reads the
      // restored stores, same as after a reset, once pending record writes
      // have landed.
      void flushAppRecords().finally(reloadApp);
    },
    onImportError: (error: unknown) => {
      showError(errorMessage(error, "Couldn't import that file"));
    },
  });

  const { resetAllData, isResetting } = useResetAppData({
    onError: (error: string) => {
      showError(error);
    },
  });

  // Both report how they went through the callbacks above
  const handleExportData = () => void exportData();
  const handleImportData = () => void importData('merge');

  const closeResetDialog = () => {
    if (isResetting) return;
    setResetDialogOpen(false);
    setResetConfirmText('');
  };

  const handleConfirmReset = async () => {
    // On success the app reloads; on failure the hook reported the error
    // through onError, so just close the dialog either way.
    await resetAllData();
    setResetDialogOpen(false);
    setResetConfirmText('');
  };

  return (
    <SettingsSection title="Data Management" icon={<DataIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Export your time tracking data for backup or import data from a previous backup.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleExportData}
          disabled={isExporting}
          sx={{ minWidth: 150 }}
        >
          {isExporting ? 'Exporting...' : 'Export Data'}
        </Button>

        <Button
          variant="outlined"
          startIcon={<UploadIcon />}
          onClick={handleImportData}
          disabled={isImporting}
          sx={{ minWidth: 150 }}
        >
          {isImporting ? 'Importing...' : 'Import Data'}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Export saves your tasks, sessions and tracked time, imported work logs, notes, note templates and goals to a
        JSON file. Import adds anything from an export file that isn&apos;t already here, keeping what you have; the app
        reloads afterwards.
      </Typography>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'error.main', mb: 1 }}>
        Danger Zone
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Permanently delete all app data and restore TaskMint to a fresh state. Consider exporting your data first.
      </Typography>

      <Button
        variant="outlined"
        color="error"
        startIcon={<ResetIcon />}
        onClick={() => setResetDialogOpen(true)}
        disabled={isResetting}
        sx={{ minWidth: 150 }}
      >
        {isResetting ? 'Resetting...' : 'Reset All Data'}
      </Button>

      <Dialog open={resetDialogOpen} onClose={closeResetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Reset All App Data?</DialogTitle>

        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This permanently deletes everything TaskMint has stored. It cannot be undone.
          </Alert>

          <DialogContentText component="div" sx={{ mb: 2 }}>
            The following will be deleted:
            <Box component="ul" sx={{ mt: 1, mb: 1, pl: 3 }}>
              <li>All tasks (including archived) and favorites</li>
              <li>All sessions and tracked time</li>
              <li>Imported work logs and project mappings</li>
              <li>Task notes and note templates</li>
              <li>Goals and every app setting</li>
              <li>The app&apos;s internal safety backups</li>
            </Box>
            Backup files you exported to your own folders are not affected. The app reloads after the reset.
          </DialogContentText>

          <TextField
            label={`Type ${RESET_CONFIRMATION_WORD} to confirm`}
            value={resetConfirmText}
            onChange={e => setResetConfirmText(e.target.value)}
            disabled={isResetting}
            fullWidth
            autoFocus
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={closeResetDialog} color="secondary" disabled={isResetting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmReset}
            variant="contained"
            color="error"
            disabled={resetConfirmText !== RESET_CONFIRMATION_WORD || isResetting}
          >
            {isResetting ? 'Deleting...' : 'Delete Everything'}
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsSection>
  );
}
