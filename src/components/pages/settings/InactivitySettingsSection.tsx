/**
 * Inactivity Settings Section
 *
 * Turns idle detection on or off and sets how long without input counts as
 * away. Detection runs in the backend on the system idle time (any app), and
 * pauses the running timer as of when input stopped; on return the app asks
 * whether to keep or discard the away time.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  FormControlLabel,
  Switch,
  Slider,
  Alert,
  Button,
  Stack,
  Divider,
  Chip,
} from '@mui/material';
import {
  Timer as TimerIcon,
  Save as SaveIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useEnhancedTimerSettings } from '../../../hooks/useEnhancedTimerSettings';
import { INACTIVITY_CONSTANTS } from '../../../constants';
import { InactivitySettings } from '../../../types/timer';
import { isTauriEnvironment, safeInvoke } from '../../../utils/tauri';

interface InactivitySettingsSectionProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const formatTime = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  return `${hours}h ${remainingMinutes}m`;
};

export function InactivitySettingsSection({
  onSuccess,
  onError,
}: InactivitySettingsSectionProps) {
  const { inactivitySettings, updateInactivitySettings, resetToDefaults } = useEnhancedTimerSettings();

  const [localSettings, setLocalSettings] = useState<InactivitySettings>(inactivitySettings);
  // The desktop app reports whether this OS exposes system idle time
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setLocalSettings(inactivitySettings);
  }, [inactivitySettings]);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    safeInvoke<boolean>('get_idle_support').then(result => {
      if (result === false) setSupported(false);
    });
  }, []);

  const hasChanges =
    localSettings.enabled !== inactivitySettings.enabled ||
    localSettings.thresholdMinutes !== inactivitySettings.thresholdMinutes;

  const handleSave = () => {
    try {
      updateInactivitySettings(localSettings);
      onSuccess('Inactivity settings saved successfully!');
    } catch (error) {
      console.error('Failed to save inactivity settings:', error);
      onError('Failed to save inactivity settings. Please try again.');
    }
  };

  const handleReset = () => {
    try {
      resetToDefaults();
      onSuccess('Inactivity settings reset to defaults!');
    } catch (error) {
      console.error('Failed to reset inactivity settings:', error);
      onError('Failed to reset inactivity settings. Please try again.');
    }
  };

  return (
    <SettingsSection
      title="Inactivity Detection"
      icon={<TimerIcon color="primary" />}
      headerChildren={
        inactivitySettings.enabled && <Chip label="Enabled" color="success" size="small" />
      }
      paperProps={{ sx: { mb: 0 } }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Pauses the running timer when your computer has had no keyboard or mouse input for
        this long, in any app. The away time isn't counted unless you choose to keep it when
        you're back.
      </Typography>

      {!supported && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          This system doesn't report idle time, so inactivity detection can't run here.
        </Alert>
      )}

      <Stack spacing={3}>
        <FormControlLabel
          control={
            <Switch
              checked={localSettings.enabled}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, enabled: e.target.checked }))}
              disabled={!supported}
            />
          }
          label={
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Enable Inactivity Detection
            </Typography>
          }
        />

        {localSettings.enabled && (
          <>
            <Divider />
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
                Pause after {formatTime(localSettings.thresholdMinutes)} without input
              </Typography>
              <Slider
                aria-label="Inactivity threshold"
                value={localSettings.thresholdMinutes}
                onChange={(_, value) =>
                  setLocalSettings(prev => ({ ...prev, thresholdMinutes: value as number }))
                }
                min={INACTIVITY_CONSTANTS.MIN_THRESHOLD_MINUTES}
                max={INACTIVITY_CONSTANTS.MAX_THRESHOLD_MINUTES}
                step={1}
                marks={[
                  { value: 1, label: '1m' },
                  { value: 15, label: '15m' },
                  { value: 30, label: '30m' },
                  { value: 60, label: '1h' },
                  { value: 120, label: '2h' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={formatTime}
              />
            </Box>
            <Alert severity="info">
              When you're back, TaskMint comes to the front and asks whether to discard the
              away time and resume, keep it and resume, or stay paused. The tray offers the
              same choices.
            </Alert>
          </>
        )}

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 2 }}>
          <Button variant="outlined" startIcon={<ResetIcon />} onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </Button>
        </Box>
      </Stack>
    </SettingsSection>
  );
}
