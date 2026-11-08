import { ReactNode } from 'react';
import { Box, Button, Divider, Stack, Switch, TextField, Typography } from '@mui/material';
import { NotificationsActive as NotificationsIcon, Send as SendIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useNotificationPreferences, NotificationPreferences } from '../../../notifications/preferences';
import { useNotification } from '../../../contexts/NotificationContext';

type CategoryKey = Exclude<keyof NotificationPreferences, 'desktopEnabled' | 'sound' | 'dailySummaryTime'>;

interface RowProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}

function SettingRow({ label, description, checked, disabled, onChange, children }: RowProps) {
  const id = `notification-setting-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          id={id}
          variant="body1"
          sx={{ fontWeight: 500 }}
          color={disabled ? 'text.disabled' : 'text.primary'}
        >
          {label}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
        {children}
      </Box>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
        slotProps={{ input: { 'aria-labelledby': id } }}
      />
    </Box>
  );
}

const REMINDERS: { key: CategoryKey; label: string; description: string }[] = [
  {
    key: 'longRunReminder',
    label: 'Long-run reminder',
    description: 'When a timer has run for the hours set under Idle & Reminders.',
  },
  {
    key: 'idlePause',
    label: 'Timer paused while you were away',
    description: 'When idle detection pauses the running timer.',
  },
  {
    key: 'goalMilestones',
    label: 'Daily goal milestones',
    description: 'Halfway, 75%, goal reached, and well past it.',
  },
];

const ACTIVITY: { key: CategoryKey; label: string; description: string }[] = [
  {
    key: 'workLogCapture',
    label: 'Work logs from the browser',
    description: 'Captured, imported, or waiting for you to review.',
  },
  { key: 'backupFailure', label: 'Automatic backup failed', description: 'Retried every hour until it works.' },
  {
    key: 'backupSuccess',
    label: 'Automatic backup saved',
    description: 'Off by default: backups run weekly on their own.',
  },
  {
    key: 'errorsWhileAway',
    label: 'Errors while TaskMint is in the background',
    description: "So a failure isn't missed while the window is hidden.",
  },
];

/**
 * Which notifications reach the system's notification centre. While you're
 * using TaskMint, messages show as toasts in the window either way.
 */
export function NotificationSettingsSection() {
  const [preferences, updatePreferences] = useNotificationPreferences();
  const { notify } = useNotification();
  const off = !preferences.desktopEnabled;

  const sendTest = () =>
    notify({
      category: 'test',
      severity: 'info',
      title: 'TaskMint',
      message: 'Notifications are working.',
      history: false,
    });

  return (
    <SettingsSection title="Notifications" icon={<NotificationsIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        While you're using TaskMint, messages appear in the corner of the window. When it's in the background or hidden
        in the tray, the ones below come as system notifications instead; reminders always do.
      </Typography>

      <SettingRow
        label="System notifications"
        description="Turn off to keep every message inside the window."
        checked={preferences.desktopEnabled}
        onChange={checked => updatePreferences({ desktopEnabled: checked })}
      />
      <SettingRow
        label="Play a sound"
        checked={preferences.sound}
        disabled={off}
        onChange={checked => updatePreferences({ sound: checked })}
      />

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        Reminders
      </Typography>
      {REMINDERS.map(({ key, label, description }) => (
        <SettingRow
          key={key}
          label={label}
          description={description}
          checked={preferences[key]}
          disabled={off}
          onChange={checked => updatePreferences({ [key]: checked })}
        />
      ))}
      <SettingRow
        label="End-of-day summary"
        description="Time tracked and earned today. Skipped on days with nothing tracked."
        checked={preferences.dailySummary}
        disabled={off}
        onChange={checked => updatePreferences({ dailySummary: checked })}
      >
        <TextField
          type="time"
          size="small"
          label="Send at"
          value={preferences.dailySummaryTime}
          disabled={off || !preferences.dailySummary}
          onChange={event => {
            if (/^\d{2}:\d{2}$/.test(event.target.value)) {
              updatePreferences({ dailySummaryTime: event.target.value });
            }
          }}
          sx={{ mt: 1.5, width: 140 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </SettingRow>

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        Activity
      </Typography>
      {ACTIVITY.map(({ key, label, description }) => (
        <SettingRow
          key={key}
          label={label}
          description={description}
          checked={preferences[key]}
          disabled={off}
          onChange={checked => updatePreferences({ [key]: checked })}
        />
      ))}

      <Divider sx={{ my: 2 }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Button variant="outlined" startIcon={<SendIcon />} onClick={sendTest}>
          Send test notification
        </Button>
        <Typography variant="body2" color="text.secondary">
          Nothing appeared? Check System Settings → Notifications → TaskMint.
        </Typography>
      </Stack>
    </SettingsSection>
  );
}
