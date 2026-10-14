import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
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
import { SettingsSection } from './SettingsSection';
import { useBackupSettingsContext } from '../../../contexts/BackupSettingsContext';
import { BackupFrequency, getBackupFrequencyLabel } from '../../../types/backup';

export function BackupSettingsSection() {
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
  } = useBackupSettingsContext();

  // Typed freely, saved (clamped to 1–100) when the field is left; clearing
  // it no longer snaps straight to 10 mid-edit.
  const [maxBackupsText, setMaxBackupsText] = useState(String(backupConfig.maxBackups));
  useEffect(() => {
    setMaxBackupsText(String(backupConfig.maxBackups));
  }, [backupConfig.maxBackups]);
  const commitMaxBackups = () => {
    const parsed = parseInt(maxBackupsText, 10);
    const clamped = Number.isNaN(parsed) ? backupConfig.maxBackups : Math.min(100, Math.max(1, parsed));
    setMaxBackupsText(String(clamped));
    if (clamped !== backupConfig.maxBackups) updateMaxBackups(clamped);
  };

  const backupFrequencies: BackupFrequency[] = ['daily', 'weekly', 'monthly'];

  // Both report their own outcome (see useBackupSettings)
  const handleSelectBackupDirectory = async () => {
    const selectedPath = await selectBackupDirectory();
    if (selectedPath) {
      updateBackupPath(selectedPath);
    }
  };

  const handleManualBackup = () => {
    void performManualBackup();
  };

  return (
    <SettingsSection title="Automatic Backups" icon={<BackupIcon color="primary" />}>

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
                size="small"
                slotProps={{
                  input: {
                    readOnly: true,
                  }
                }}
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
            <InputLabel id="backup-frequency-label">Backup Frequency</InputLabel>
            <Select
              labelId="backup-frequency-label"
              id="backup-frequency"
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
            value={maxBackupsText}
            onChange={(e) => setMaxBackupsText(e.target.value)}
            onBlur={commitMaxBackups}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMaxBackups();
            }}
            size="small"
            sx={{ maxWidth: 250 }}
            helperText="Older backups will be automatically deleted"
            slotProps={{
              htmlInput: { min: 1, max: 100 }
            }}
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

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Backups run on their own at the frequency you choose; Backup Now makes one any time.
      </Typography>
    </SettingsSection>
  );
}
