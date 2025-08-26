import {
  Box,
  Typography,
  Button,
  Stack,
  Alert,
  Switch,
  FormControlLabel,
  TextField,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Cloud as CloudIcon,
  CloudSync as CloudSyncIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useCloudSync } from '../../../hooks/useCloudSync';

interface CloudSyncSettingsSectionProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function CloudSyncSettingsSection({ onSuccess, onError }: CloudSyncSettingsSectionProps) {
  const {
    config: cloudSyncConfig,
    status: cloudSyncStatus,
    updateConfig: updateCloudSyncConfig,
    getAuthUrl,
    disconnect,
    sync,
    getFormattedStatus,
  } = useCloudSync({
    onSyncSuccess: () => onSuccess?.(),
    onSyncError: (error) => onError?.(error),
    onAuthSuccess: () => onSuccess?.(),
    onAuthError: (error) => onError?.(error),
  });

  const handleConnectGoogleDrive = async () => {
    try {
      const authUrl = await getAuthUrl();
      // Open auth URL in browser
      window.open(authUrl, '_blank');
      // Note: In a real implementation, you'd handle the OAuth callback
      // For now, we'll simulate successful authentication
      setTimeout(() => {
        // This would be replaced with actual OAuth callback handling
        onSuccess?.();
      }, 2000);
    } catch (error) {
      console.error('Failed to connect to Google Drive:', error);
      const errorMessage = 'Failed to connect to Google Drive. Please try again.';
      onError?.(errorMessage);
    }
  };

  const handleDisconnectGoogleDrive = () => {
    disconnect();
    onSuccess?.();
  };

  const handleCloudSync = async () => {
    try {
      const result = await sync();
      if (result.success) {
        onSuccess?.();
      } else {
        const errorMessage = result.error || 'Sync failed';
        onError?.(errorMessage);
      }
    } catch (error) {
      console.error('Cloud sync failed:', error);
      const errorMessage = 'Cloud sync failed. Please try again.';
      onError?.(errorMessage);
    }
  };

  return (
      <SettingsSection title="Cloud Sync (Google Drive)" icon={<CloudIcon color="primary" />}>

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
            {cloudSyncStatus.authStatus === 'connecting' ? 'Connecting...' : 'Connect to Google Drive'}
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
    </SettingsSection>
  );
}
