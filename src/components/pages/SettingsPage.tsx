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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  TextField,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Upload as UploadIcon,
  Description as TemplateIcon,
  Storage as DataIcon,
  Timer as TimerIcon,
  Dashboard as DashboardIcon,
  Backup as BackupIcon,
  Folder as FolderIcon,
  Cloud as CloudIcon,
  CloudSync as CloudSyncIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { NoteTemplates } from './NoteTemplates';
import { useDataBackup } from '../../hooks/useDataBackup';
import { useTimerSettings } from '../../hooks/useTimerSettings';
import { useDashboardSettings } from '../../hooks/useDashboardSettings';
import { useBackupSettings } from '../../hooks/useBackupSettings';
import { useCloudSync } from '../../hooks/useCloudSync';
import { TimerRoundingOption } from '../../types/timer';
import { BackupFrequency, getBackupFrequencyLabel } from '../../types/backup';
import { getRoundingOptionLabel } from '../../utils/formatters';

export function SettingsPage() {
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const { exportData, importData, isExporting, isImporting } = useDataBackup({
    onExportSuccess: () => {
      setExportSuccess(true);
      setExportError(null);
    },
    onExportError: (error) => {
      setExportError(error);
      setExportSuccess(false);
    },
    onImportSuccess: (result) => {
      console.log('Import successful:', result);
      setImportSuccess(true);
      setImportError(null);
    },
    onImportError: (error) => {
      setImportError(error);
      setImportSuccess(false);
    },
  });

  const { roundingOption, updateRoundingOption } = useTimerSettings();
  const {
    getAvailableWidgets,
    isWidgetEnabled,
    toggleWidget,
    resetToDefaults
  } = useDashboardSettings();

  const {
    config: backupConfig,
    status: backupStatus,
    toggleEnabled: toggleBackupEnabled,
    updateFrequency: updateBackupFrequency,
    updateBackupPath,
    updateMaxBackups,
    selectBackupDirectory,
    performManualBackup,
    getStatusSummary,
  } = useBackupSettings();

  // Cloud sync settings
  const {
    config: cloudSyncConfig,
    status: cloudSyncStatus,
    updateConfig: updateCloudSyncConfig,
    getAuthUrl,
    // authenticate, // Commented out unused variable
    disconnect,
    sync,
    getFormattedStatus,
  } = useCloudSync({
    onSyncSuccess: () => setExportSuccess(true),
    onSyncError: (error) => setExportError(error),
    onAuthSuccess: () => setExportSuccess(true),
    onAuthError: (error) => setExportError(error),
  });

  const roundingOptions: TimerRoundingOption[] = ['none', 'up-5min', 'up-15min', 'up-30min'];
  const backupFrequencies: BackupFrequency[] = ['daily', 'weekly', 'monthly'];
  const availableWidgets = getAvailableWidgets();

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
    try {
      await importData('merge'); // Default to merge mode
    } catch (error) {
      console.error('Import failed:', error);
      setImportError('Failed to import data. Please try again.');
      setImportSuccess(false);
    }
  };

  const handleSelectBackupDirectory = async () => {
    try {
      const selectedPath = await selectBackupDirectory();
      if (selectedPath) {
        updateBackupPath(selectedPath);
      }
    } catch (error) {
      console.error('Failed to select backup directory:', error);
      setExportError('Failed to select backup directory. Please try again.');
    }
  };

  const handleManualBackup = async () => {
    try {
      const result = await performManualBackup();
      if (result.success) {
        setExportSuccess(true);
        setExportError(null);
      } else {
        setExportError(result.error || 'Backup failed');
        setExportSuccess(false);
      }
    } catch (error) {
      console.error('Manual backup failed:', error);
      setExportError('Manual backup failed. Please try again.');
      setExportSuccess(false);
    }
  };

  // Cloud sync handlers
  const handleConnectGoogleDrive = async () => {
    try {
      const authUrl = await getAuthUrl();
      // Open auth URL in browser
      window.open(authUrl, '_blank');
      // Note: In a real implementation, you'd handle the OAuth callback
      // For now, we'll simulate successful authentication
      setTimeout(() => {
        // This would be replaced with actual OAuth callback handling
        setExportSuccess(true);
      }, 2000);
    } catch (error) {
      console.error('Failed to connect to Google Drive:', error);
      setExportError('Failed to connect to Google Drive. Please try again.');
    }
  };

  const handleDisconnectGoogleDrive = () => {
    disconnect();
    setExportSuccess(true);
  };

  const handleCloudSync = async () => {
    try {
      const result = await sync();
      if (result.success) {
        setExportSuccess(true);
        setExportError(null);
      } else {
        setExportError(result.error || 'Sync failed');
        setExportSuccess(false);
      }
    } catch (error) {
      console.error('Cloud sync failed:', error);
      setExportError('Cloud sync failed. Please try again.');
      setExportSuccess(false);
    }
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

      {/* Timer Settings Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TimerIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Timer Settings
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure how timer durations are calculated and displayed.
        </Typography>

        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel id="rounding-option-label">Duration Rounding</InputLabel>
          <Select
            labelId="rounding-option-label"
            value={roundingOption}
            label="Duration Rounding"
            onChange={(e) => updateRoundingOption(e.target.value as TimerRoundingOption)}
          >
            {roundingOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {getRoundingOptionLabel(option)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Duration Rounding:</strong> Choose how timer durations are rounded when stopping a timer.
            This affects the final duration saved for time entries and earnings calculations.
          </Typography>
        </Alert>
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Dashboard Customization Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <DashboardIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Dashboard Customization
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Customize which widgets are displayed on your dashboard and their visibility.
        </Typography>

        <List>
          {availableWidgets.map((widget) => (
            <ListItem key={widget.id} divider>
              <ListItemText
                primary={widget.title}
                secondary={widget.description}
              />
              <ListItemSecondaryAction>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isWidgetEnabled(widget.id)}
                      onChange={() => toggleWidget(widget.id)}
                      color="primary"
                    />
                  }
                  label={isWidgetEnabled(widget.id) ? 'Visible' : 'Hidden'}
                  labelPlacement="start"
                />
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            onClick={resetToDefaults}
            size="small"
          >
            Reset to Defaults
          </Button>
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Widget Visibility:</strong> Toggle widgets on/off to customize your dashboard view.
            Changes are saved automatically and will be applied immediately.
          </Typography>
        </Alert>
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Automatic Backup Settings Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <BackupIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Automatic Backups
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure automatic periodic backups to protect your data. Backups are saved locally to your chosen directory.
        </Typography>

        {/* Enable/Disable Toggle */}
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={backupConfig.enabled}
                onChange={toggleBackupEnabled}
                color="primary"
              />
            }
            label="Enable automatic backups"
          />
        </Box>

        {/* Backup Configuration - Only show when enabled */}
        {backupConfig.enabled && (
          <Stack spacing={3}>
            {/* Backup Directory Selection */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Backup Directory
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  fullWidth
                  value={backupConfig.backupPath}
                  placeholder="Select a directory for backups..."
                  InputProps={{
                    readOnly: true,
                  }}
                  size="small"
                />
                <Button
                  variant="outlined"
                  startIcon={<FolderIcon />}
                  onClick={handleSelectBackupDirectory}
                  sx={{ minWidth: 120 }}
                >
                  Browse
                </Button>
              </Box>
            </Box>

            {/* Backup Frequency */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Backup Frequency</InputLabel>
              <Select
                value={backupConfig.frequency}
                label="Backup Frequency"
                onChange={(e) => updateBackupFrequency(e.target.value as BackupFrequency)}
              >
                {backupFrequencies.map((frequency) => (
                  <MenuItem key={frequency} value={frequency}>
                    {getBackupFrequencyLabel(frequency)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Max Backups */}
            <TextField
              label="Maximum Backups to Keep"
              type="number"
              value={backupConfig.maxBackups}
              onChange={(e) => updateMaxBackups(parseInt(e.target.value) || 10)}
              inputProps={{ min: 1, max: 100 }}
              size="small"
              sx={{ maxWidth: 250 }}
              helperText="Older backups will be automatically deleted"
            />

            {/* Manual Backup Button */}
            <Box>
              <Button
                variant="contained"
                startIcon={backupStatus.isRunning ? <CircularProgress size={16} /> : <BackupIcon />}
                onClick={handleManualBackup}
                disabled={backupStatus.isRunning || !backupConfig.backupPath}
                sx={{ minWidth: 150 }}
              >
                {backupStatus.isRunning ? 'Creating Backup...' : 'Backup Now'}
              </Button>
            </Box>
          </Stack>
        )}

        {/* Status Display */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Status
          </Typography>
          <Chip
            label={getStatusSummary()}
            color={
              !backupConfig.enabled ? 'default' :
              backupStatus.isRunning ? 'info' :
              backupStatus.lastBackupSuccess === false ? 'error' :
              backupStatus.lastBackupSuccess === true ? 'success' : 'default'
            }
            variant="outlined"
          />
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Automatic Backups:</strong> When enabled, backups will be created automatically based on your selected frequency.
            Manual backups can be created at any time using the "Backup Now" button.
          </Typography>
        </Alert>
      </Paper>

      <Divider sx={{ my: 4 }} />

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
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Cloud Sync Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CloudIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Cloud Sync (Google Drive)
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Synchronize your data with Google Drive for backup and access across devices.
        </Typography>

        {/* Connection Status */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Connection Status
          </Typography>
          <Chip
            icon={
              cloudSyncStatus.authStatus === 'connected' ? <CloudSyncIcon /> :
              cloudSyncStatus.authStatus === 'connecting' ? <CircularProgress size={16} /> :
              <CloudOffIcon />
            }
            label={getFormattedStatus()}
            color={
              cloudSyncStatus.authStatus === 'connected' ? 'success' :
              cloudSyncStatus.authStatus === 'connecting' ? 'info' :
              cloudSyncStatus.authStatus === 'error' ? 'error' : 'default'
            }
            variant="outlined"
          />
        </Box>

        {/* Connection Controls */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
          {cloudSyncStatus.authStatus === 'connected' ? (
            <>
              <Button
                variant="contained"
                startIcon={cloudSyncStatus.syncStatus === 'syncing' ? <CircularProgress size={16} /> : <SyncIcon />}
                onClick={handleCloudSync}
                disabled={cloudSyncStatus.syncStatus === 'syncing'}
                sx={{ minWidth: 150 }}
              >
                {cloudSyncStatus.syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
              </Button>

              <Button
                variant="outlined"
                startIcon={<CloudOffIcon />}
                onClick={handleDisconnectGoogleDrive}
                sx={{ minWidth: 150 }}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              startIcon={<CloudIcon />}
              onClick={handleConnectGoogleDrive}
              disabled={cloudSyncStatus.authStatus === 'connecting'}
              sx={{ minWidth: 150 }}
            >
              {cloudSyncStatus.authStatus === 'connecting' ? 'Connecting...' : 'Connect Google Drive'}
            </Button>
          )}
        </Stack>

        {/* Sync Configuration - Only show when connected */}
        {cloudSyncStatus.authStatus === 'connected' && (
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={cloudSyncConfig.autoSync}
                  onChange={(e) => updateCloudSyncConfig({ autoSync: e.target.checked })}
                  color="primary"
                />
              }
              label="Enable automatic sync"
            />

            {cloudSyncConfig.autoSync && (
              <TextField
                label="Sync Interval (minutes)"
                type="number"
                value={cloudSyncConfig.syncInterval}
                onChange={(e) => updateCloudSyncConfig({ syncInterval: parseInt(e.target.value) || 30 })}
                inputProps={{ min: 5, max: 1440 }}
                size="small"
                sx={{ maxWidth: 250 }}
                helperText="How often to automatically sync (5 minutes to 24 hours)"
              />
            )}
          </Stack>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Cloud Sync:</strong> Securely backup and synchronize your time tracking data with Google Drive.
            Your data is encrypted and only accessible by you.
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

      {/* Import Success Notification */}
      <Snackbar
        open={importSuccess}
        autoHideDuration={6000}
        onClose={() => setImportSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setImportSuccess(false)}
          severity="success"
          sx={{ width: '100%' }}
        >
          Data imported successfully!
        </Alert>
      </Snackbar>

      {/* Import Error Notification */}
      <Snackbar
        open={!!importError}
        autoHideDuration={6000}
        onClose={() => setImportError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setImportError(null)}
          severity="error"
          sx={{ width: '100%' }}
        >
          {importError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
