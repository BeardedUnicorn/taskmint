import { ReactNode } from 'react';
import { Box, Button, Divider, Stack, Switch, TextField, Typography } from '@mui/material';
import { NotificationsActive as NotificationsIcon, Send as SendIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useNotificationPreferences, NotificationPreferences } from '../../../notifications/preferences';
import { useNotification } from '../../../contexts/NotificationContext';
import { getBackend } from '../../../backend';
import { askToNotify } from '../../../hooks/useAskToNotify';
import type { Platform } from '../../../backend/types';

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

/** A kind of notification, and the platform feature it needs to ever be sent (none: every device). */
interface Kind {
  key: CategoryKey;
  label: string;
  description: string;
  needs?: keyof Platform;
}

const REMINDERS: Kind[] = [
  {
    key: 'longRunReminder',
    label: 'Long-run reminder',
    description: 'When a timer has run for the hours set under Idle & Reminders.',
    // The desktop's idle monitor keeps the time
    needs: 'idle',
  },
  {
    key: 'idlePause',
    label: 'Timer paused while you were away',
    description: 'When idle detection pauses the running timer.',
    needs: 'idle',
  },
  {
    key: 'goalMilestones',
    label: 'Daily goal milestones',
    description: 'Halfway, 75%, goal reached, and well past it.',
  },
];

const ACTIVITY: Kind[] = [
  {
    key: 'workLogCapture',
    label: 'Work logs from the browser',
    description: 'Captured, imported, or waiting for you to review.',
    // The browser extension delivers captures to the desktop app
    needs: 'captureStatus',
  },
  {
    key: 'backupFailure',
    label: 'Automatic backup failed',
    description: 'Retried every hour until it works.',
    needs: 'folderBackups',
  },
  {
    key: 'backupSuccess',
    label: 'Automatic backup saved',
    description: 'Off by default: backups run weekly on their own.',
    needs: 'folderBackups',
  },
  {
    key: 'errorsWhileAway',
    label: 'Errors while TaskMint is in the background',
    description: "So a failure isn't missed while TaskMint isn't in front.",
  },
];

/**
 * What each kind of device calls its parts: where messages show, and where
 * to allow notifications. A phone sets each group's sound itself (Android's
 * notification channels), so the app has no sound switch there.
 */
const WORDS = {
  desktop: {
    soundSwitch: true,
    intro:
      "While you're using TaskMint, messages appear in the corner of the window. When it's in the background or hidden in the tray, the ones below come as system notifications instead; reminders always do.",
    inside: 'Turn off to keep every message inside the window.',
    help: 'Nothing appeared? Check System Settings → Notifications → TaskMint.',
  },
  mobile: {
    soundSwitch: false,
    intro:
      "While you're using TaskMint, messages appear at the bottom of the screen. When it's in the background, the ones below come as notifications instead; reminders always do.",
    inside: 'Turn off to keep every message inside the app.',
    help: "Sounds and pop-ups for Reminders and Activity are in your phone's Settings → Apps → TaskMint → Notifications. Nothing appeared? Check there too.",
  },
  web: {
    soundSwitch: true,
    intro:
      "While you're using TaskMint, messages appear in the corner of the page. When it's in another tab, the ones below come as browser notifications instead.",
    inside: 'Turn off to keep every message inside the page.',
    help: 'Nothing appeared? Check that your browser lets this site show notifications.',
  },
};

/**
 * Which notifications reach the system's notification centre. While you're
 * using TaskMint, messages show as toasts in the window either way. A
 * device only lists the kinds it can send: a phone has no idle monitor,
 * browser captures or folder backups.
 */
export function NotificationSettingsSection() {
  const [preferences, updatePreferences] = useNotificationPreferences();
  const { notify } = useNotification();
  const off = !preferences.desktopEnabled;
  const { capabilities, platform } = getBackend();
  const words = WORDS[capabilities.runtime];
  // Only the kinds this device can ever send
  const sendable = (kinds: Kind[]) => kinds.filter(kind => !kind.needs || platform[kind.needs] !== undefined);

  const sendTest = () => {
    askToNotify();
    notify({
      category: 'test',
      severity: 'info',
      title: 'TaskMint',
      message: 'Notifications are working.',
      history: false,
    });
  };

  return (
    <SettingsSection title="Notifications" icon={<NotificationsIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {words.intro}
      </Typography>

      <SettingRow
        label="System notifications"
        description={words.inside}
        checked={preferences.desktopEnabled}
        onChange={checked => updatePreferences({ desktopEnabled: checked })}
      />
      {words.soundSwitch && (
        <SettingRow
          label="Play a sound"
          checked={preferences.sound}
          disabled={off}
          onChange={checked => updatePreferences({ sound: checked })}
        />
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        Reminders
      </Typography>
      {sendable(REMINDERS).map(({ key, label, description }) => (
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
      {sendable(ACTIVITY).map(({ key, label, description }) => (
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
          {words.help}
        </Typography>
      </Stack>
    </SettingsSection>
  );
}
