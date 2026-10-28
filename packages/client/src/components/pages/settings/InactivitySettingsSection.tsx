/**
 * Idle & Reminders Settings Section
 *
 * Idle detection: on or off, and how long without input counts as away.
 * Detection runs in the backend on the system idle time (any app), and
 * pauses the running timer as of when input stopped; on return the app asks
 * whether to keep or discard the away time.
 *
 * The long-run reminder: a notification once a timer has run for a set
 * number of hours straight, for the timer that got forgotten. It works with
 * detection off.
 *
 * Changes apply as they're made, like the other sections.
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Timer as TimerIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useEnhancedTimerSettings } from '../../../hooks/useEnhancedTimerSettings';
import { INACTIVITY_CONSTANTS } from '../../../constants';
import { getBackend } from '../../../backend';
import { useNotification } from '../../../contexts/NotificationContext';

/** Hours offered for the long-run reminder (0 = off). */
export const LONG_RUN_HOUR_OPTIONS = [0, 2, 3, 4, 6, 8] as const;

/** A threshold in words: "1 minute", "2 hours", "1h 30m". */
export const formatThreshold = (minutes: number): string => {
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

export function InactivitySettingsSection() {
  const { inactivitySettings, updateInactivitySettings, resetToDefaults } = useEnhancedTimerSettings();
  const { showSuccess } = useNotification();

  // The slider moves freely while dragged and saves when let go
  const [threshold, setThreshold] = useState(inactivitySettings.thresholdMinutes);
  // Whether this OS exposes system idle time (none where the platform has
  // no idle detection at all)
  const [supported, setSupported] = useState(() => getBackend().platform.idle !== undefined);

  useEffect(() => {
    setThreshold(inactivitySettings.thresholdMinutes);
  }, [inactivitySettings.thresholdMinutes]);

  useEffect(() => {
    getBackend().platform.idle?.isSupported().then(
      result => {
        if (!result) setSupported(false);
      },
      error => console.warn('Failed to ask whether idle time is available:', error)
    );
  }, []);

  const handleReset = () => {
    resetToDefaults();
    showSuccess('Idle and reminder settings are back to their defaults');
  };

  return (
    <SettingsSection
      title="Idle & Reminders"
      icon={<TimerIcon color="primary" />}
      headerChildren={
        inactivitySettings.enabled && <Chip label="Idle detection on" color="success" size="small" />
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
              checked={inactivitySettings.enabled}
              onChange={(e) => updateInactivitySettings({ enabled: e.target.checked })}
              disabled={!supported}
            />
          }
          label={
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Enable Inactivity Detection
            </Typography>
          }
        />

        {inactivitySettings.enabled && (
          <>
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
                Pause after {formatThreshold(threshold)} without input
              </Typography>
              <Slider
                aria-label="Inactivity threshold"
                value={threshold}
                onChange={(_, value) => setThreshold(value as number)}
                onChangeCommitted={(_, value) =>
                  updateInactivitySettings({ thresholdMinutes: value as number })
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
                valueLabelFormat={formatThreshold}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              When you're back, TaskMint comes to the front and asks whether to discard the
              away time and resume, keep it and resume, or stay paused. The tray offers the
              same choices.
            </Typography>
          </>
        )}

        <Divider />

        <Box>
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel id="long-run-label">Remind me after a timer runs</InputLabel>
            <Select
              labelId="long-run-label"
              label="Remind me after a timer runs"
              value={inactivitySettings.longRunHours}
              onChange={(e) => updateInactivitySettings({ longRunHours: Number(e.target.value) })}
            >
              {LONG_RUN_HOUR_OPTIONS.map(hours => (
                <MenuItem key={hours} value={hours}>
                  {hours === 0 ? 'Never' : `${hours} hours straight`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            A notification for the timer you forgot to stop. It works with idle detection off.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="outlined" startIcon={<ResetIcon />} onClick={handleReset}>
            Reset to Defaults
          </Button>
        </Box>
      </Stack>
    </SettingsSection>
  );
}
