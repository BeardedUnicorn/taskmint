import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  TextField,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Backup as BackupIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import { useBackupSettings } from '../../../hooks/useBackupSettings';
import { BackupFrequency, getBackupFrequencyLabel } from '../../../types/backup';

interface BackupSettingsSectionProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function BackupSettingsSection({ onSuccess, onError }: BackupSettingsSectionProps) {
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

  const backupFrequencies: BackupFrequency[] = ['daily', 'weekly', 'monthly'];

  const handleSelectBackupDirectory = async () => {
    try {
      const selectedPath = await selectBackupDirectory();
      if (selectedPath) {
        updateBackupPath(selectedPath);
      }
    } catch (error) {
      console.error('Failed to select backup directory:', error);
      const errorMessage = 'Failed to select backup directory. Please try again.';
      onError?.(errorMessage);
    }
  };

  const handleManualBackup = async () => {
    try {
      const result = await performManualBackup();
      if (result.success) {
        onSuccess?.();
      } else {
        const errorMessage = result.error || 'Backup failed';
        onError?.(errorMessage);
      }
    } catch (error) {
      console.error('Manual backup failed:', error);
      const errorMessage = 'Manual backup failed. Please try again.';
      onError?.(errorMessage);
    }
  };

  return (
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
  );
}
