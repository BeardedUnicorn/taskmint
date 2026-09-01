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

// Typed confirmation guarding the full app-data reset.
export const RESET_CONFIRMATION_WORD = 'RESET';

interface DataManagementSectionProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onImportSuccess?: () => void;
  onImportError?: (error: string) => void;
}

export function DataManagementSection({ onSuccess, onError, onImportSuccess, onImportError }: DataManagementSectionProps) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const { exportData, importData, isExporting, isImporting } = useDataBackup({
    onExportSuccess: () => {
      onSuccess?.();
    },
    onExportError: (error: unknown) => {
      onError?.(error as string);
    },
    onImportSuccess: (result: any) => {
      console.log('Import successful:', result);
      onImportSuccess?.();
    },
    onImportError: (error: unknown) => {
      onImportError?.(error as string);
    },
  });

  const { resetAllData, isResetting } = useResetAppData({
    onError: (error: string) => {
      onError?.(error);
    },
  });

  const handleExportData = async () => {
    try {
      await exportData();
    } catch (error) {
      console.error('Export failed:', error);
      const errorMessage = 'Failed to export data. Please try again.';
      onError?.(errorMessage);
    }
  };

  const handleImportData = async () => {
    try {
      await importData('merge'); // Default to merge mode
    } catch (error) {
      console.error('Import failed:', error);
      const errorMessage = 'Failed to import data. Please try again.';
      onImportError?.(errorMessage);
    }
  };

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

      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Export:</strong> Downloads all your time entries, tasks, and note templates as a JSON file.
          <br />
          <strong>Import:</strong> Restores data from a previously exported JSON file.
        </Typography>
      </Alert>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'error.main', mb: 1 }}>
        Danger Zone
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Permanently delete all app data and restore TaskMint to a fresh state.
        Consider exporting your data first.
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
            Backup files you exported to your own folders are not affected.
            The app reloads after the reset.
          </DialogContentText>

          <TextField
            label={`Type ${RESET_CONFIRMATION_WORD} to confirm`}
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
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
