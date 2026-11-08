/**
 * Which notifications may reach the OS. Kept in localStorage and pushed to
 * the backend (set_notification_preferences), which applies them to the
 * notifications it shows itself (long-run reminder, idle pause).
 */

import { z } from 'zod';
import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';

const flag = (fallback: boolean) => z.boolean().default(fallback).catch(fallback);

/** Each field falls back on its own, so one bad value doesn't reset the rest. */
export const NotificationPreferencesSchema = z.object({
  /** Master switch for OS notifications. */
  desktopEnabled: flag(true),
  /** Play the system sound with each one. */
  sound: flag(false),
  goalMilestones: flag(true),
  longRunReminder: flag(true),
  idlePause: flag(true),
  workLogCapture: flag(true),
  backupFailure: flag(true),
  backupSuccess: flag(false),
  dailySummary: flag(true),
  /** Local time, HH:MM. */
  dailySummaryTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('18:00')
    .catch('18:00'),
  errorsWhileAway: flag(true),
});

export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = NotificationPreferencesSchema.parse({});

/** Saved preferences made whole (missing or invalid fields take their defaults). */
export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  const result = NotificationPreferencesSchema.safeParse(value && typeof value === 'object' ? value : {});
  return result.success ? result.data : DEFAULT_NOTIFICATION_PREFERENCES;
}

export function useNotificationPreferences(): readonly [
  NotificationPreferences,
  (updates: Partial<NotificationPreferences>) => void,
] {
  const [stored, setStored] = useLocalStorage<unknown>(NOTIFICATION_PREFERENCES_KEY, DEFAULT_NOTIFICATION_PREFERENCES);
  const preferences = useMemo(() => parseNotificationPreferences(stored), [stored]);
  const update = useCallback(
    (updates: Partial<NotificationPreferences>) =>
      setStored((previous: unknown) => ({ ...parseNotificationPreferences(previous), ...updates })),
    [setStored]
  );
  return [preferences, update] as const;
}
