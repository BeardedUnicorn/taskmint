import {
  Box,
  Typography,
  Button,
  Stack,
  Alert,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Upload as UploadIcon,
  Storage as DataIcon,
} from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useDataBackup } from '../../../hooks/useDataBackup';

interface DataManagementSectionProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onImportSuccess?: () => void;
  onImportError?: (error: string) => void;
}

export function DataManagementSection({ onSuccess, onError, onImportSuccess, onImportError }: DataManagementSectionProps) {
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
    </SettingsSection>
  );
}
