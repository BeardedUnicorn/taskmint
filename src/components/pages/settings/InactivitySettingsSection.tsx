/**
 * Inactivity Settings Section
 * 
 * Provides configuration options for inactivity detection including
 * thresholds, warnings, and automatic pause behavior.
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
  Warning as WarningIcon,
  Save as SaveIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useEnhancedTimerSettings } from '../../../hooks/useEnhancedTimerSettings';
import { INACTIVITY_CONSTANTS } from '../../../constants';
import { InactivitySettings } from '../../../types/timer';

interface InactivitySettingsSectionProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function InactivitySettingsSection({
  onSuccess,
  onError,
}: InactivitySettingsSectionProps) {
  const { inactivitySettings, updateInactivitySettings, resetToDefaults } = useEnhancedTimerSettings();
  
  const [localSettings, setLocalSettings] = useState<InactivitySettings>(inactivitySettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(inactivitySettings);
    setHasChanges(false);
  }, [inactivitySettings]);

  // Check for changes
  useEffect(() => {
    const changed = JSON.stringify(localSettings) !== JSON.stringify(inactivitySettings);
    setHasChanges(changed);
  }, [localSettings, inactivitySettings]);

  const handleSettingChange = (field: keyof InactivitySettings, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateInactivitySettings(localSettings);
      onSuccess('Inactivity settings saved successfully!');
    } catch (error) {
      console.error('Failed to save inactivity settings:', error);
      onError('Failed to save inactivity settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      await resetToDefaults();
      onSuccess('Inactivity settings reset to defaults!');
    } catch (error) {
      console.error('Failed to reset inactivity settings:', error);
      onError('Failed to reset inactivity settings. Please try again.');
    }
  };

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

  return (
      <SettingsSection
        title="Inactivity Detection"
        icon={<TimerIcon color="primary" />}
        headerChildren={
          localSettings.enabled && (
            <Chip
              label="Enabled"
              color="success"
              size="small"
            />
          )
        }
        paperProps={{ sx: { mb: 0 } }}
      >
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Automatically pause timers when no user activity is detected to ensure accurate time tracking.
      </Typography>

      <Stack spacing={3}>
        {/* Enable/Disable */}
        <FormControlLabel
          control={
            <Switch
              checked={localSettings.enabled}
              onChange={(e) => handleSettingChange('enabled', e.target.checked)}
            />
          }
          label={
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Enable Inactivity Detection
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monitor user activity and automatically pause timers when inactive
              </Typography>
            </Box>
          }
        />

        {localSettings.enabled && (
          <>
            <Divider />

            {/* Inactivity Threshold */}
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
                Inactivity Threshold: {formatTime(localSettings.thresholdMinutes)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                How long to wait before considering the user inactive
              </Typography>
              <Slider
                value={localSettings.thresholdMinutes}
                onChange={(_, value) => handleSettingChange('thresholdMinutes', value as number)}
                min={INACTIVITY_CONSTANTS.MIN_THRESHOLD_MINUTES}
                max={INACTIVITY_CONSTANTS.MAX_THRESHOLD_MINUTES}
                step={1}
                marks={[
                  { value: 1, label: '1m' },
                  { value: 5, label: '5m' },
                  { value: 15, label: '15m' },
                  { value: 30, label: '30m' },
                  { value: 60, label: '1h' },
                  { value: 120, label: '2h' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={formatTime}
              />
            </Box>

            {/* Warning Settings */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={localSettings.showWarningBeforePause}
                    onChange={(e) => handleSettingChange('showWarningBeforePause', e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Show Warning Before Auto-Pause
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Display a countdown warning before automatically pausing the timer
                    </Typography>
                  </Box>
                }
              />

              {localSettings.showWarningBeforePause && (
                <Box sx={{ mt: 2, ml: 4 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                    Warning Duration: {localSettings.warningDurationSeconds} seconds
                  </Typography>
                  <Slider
                    value={localSettings.warningDurationSeconds}
                    onChange={(_, value) => handleSettingChange('warningDurationSeconds', value as number)}
                    min={INACTIVITY_CONSTANTS.MIN_WARNING_SECONDS}
                    max={INACTIVITY_CONSTANTS.MAX_WARNING_SECONDS}
                    step={5}
                    marks={[
                      { value: 5, label: '5s' },
                      { value: 15, label: '15s' },
                      { value: 30, label: '30s' },
                      { value: 45, label: '45s' },
                      { value: 60, label: '60s' },
                    ]}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value}s`}
                  />
                </Box>
              )}
            </Box>

            {/* Resume Behavior */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={localSettings.resumeOnActivity}
                    onChange={(e) => handleSettingChange('resumeOnActivity', e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Auto-Resume on Activity
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Automatically resume the timer when activity is detected after a pause
                    </Typography>
                  </Box>
                }
              />

              {!localSettings.resumeOnActivity && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Recommended:</strong> Keep this disabled for safety. 
                    Manual resume ensures you don't accidentally track time when away from your computer.
                  </Typography>
                </Alert>
              )}
            </Box>

            <Divider />

            {/* Testing Mode */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={localSettings.testingMode || false}
                    onChange={(e) => handleSettingChange('testingMode', e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Development Testing Mode
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Use shorter thresholds for easier testing and development
                    </Typography>
                  </Box>
                }
              />

              {localSettings.testingMode && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Testing Mode Active:</strong> Inactivity thresholds are significantly reduced for development purposes.
                    <br />
                    • 15 minutes → 1 minute
                    • 30 minutes → 2 minutes
                    • 60 minutes → 3 minutes
                    <br />
                    Warning duration is also reduced to 1/3 of the normal time.
                  </Typography>
                </Alert>
              )}
            </Box>

            <Divider />

            {/* Preview */}
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
                Current Configuration Preview
              </Typography>
              <Alert severity="info" icon={<WarningIcon />}>
                <Typography variant="body2">
                  Timer will pause after <strong>{formatTime(localSettings.thresholdMinutes)}</strong> of inactivity
                  {localSettings.showWarningBeforePause && (
                    <>, with a <strong>{localSettings.warningDurationSeconds}-second warning</strong></>
                  )}
                  . {localSettings.resumeOnActivity 
                    ? 'Timer will automatically resume when activity is detected.' 
                    : 'Manual resume will be required.'
                  }
                </Typography>
              </Alert>
            </Box>
          </>
        )}

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ResetIcon />}
            onClick={handleReset}
            disabled={isSaving}
          >
            Reset to Defaults
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Stack>
    </SettingsSection>
  );
}
