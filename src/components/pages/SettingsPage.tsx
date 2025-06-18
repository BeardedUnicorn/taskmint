import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  Button,
  Stack,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Upload as UploadIcon,
  Description as TemplateIcon,
  Storage as DataIcon,
} from '@mui/icons-material';
import { NoteTemplates } from './NoteTemplates';
import { useDataBackup } from '../../hooks/useDataBackup';

export function SettingsPage() {
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  
  const { exportData, isExporting } = useDataBackup({
    onExportSuccess: () => {
      setExportSuccess(true);
      setExportError(null);
    },
    onExportError: (error) => {
      setExportError(error);
      setExportSuccess(false);
    },
  });

  const handleExportData = async () => {
    try {
      await exportData();
    } catch (error) {
      console.error('Export failed:', error);
      setExportError('Failed to export data. Please try again.');
      setExportSuccess(false);
    }
  };

  const handleImportData = async () => {
    // TODO: Implement import functionality
    setExportError('Import functionality is not yet implemented.');
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
        Settings
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage your application settings, note templates, and data
      </Typography>

      {/* Data Management Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <DataIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Data Management
          </Typography>
        </Box>
        
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
            disabled={true}
            sx={{ minWidth: 150 }}
          >
            Import Data (Coming Soon)
          </Button>
        </Stack>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Export:</strong> Downloads all your time entries, tasks, and note templates as a JSON file.
            <br />
            <strong>Import:</strong> Restores data from a previously exported JSON file.
          </Typography>
        </Alert>
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Note Templates Section */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TemplateIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Note Templates
          </Typography>
        </Box>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Create and manage note templates for consistent documentation across your tasks.
        </Typography>

        {/* Embed the NoteTemplates component */}
        <Box sx={{ 
          border: '1px solid', 
          borderColor: 'divider', 
          borderRadius: 1,
          overflow: 'hidden'
        }}>
          <NoteTemplates />
        </Box>
      </Paper>

      {/* Success/Error Snackbars */}
      <Snackbar
        open={exportSuccess}
        autoHideDuration={4000}
        onClose={() => setExportSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setExportSuccess(false)} 
          severity="success" 
          sx={{ width: '100%' }}
        >
          Data operation completed successfully!
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!exportError}
        autoHideDuration={6000}
        onClose={() => setExportError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setExportError(null)} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          {exportError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
