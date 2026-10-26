/**
 * Notification types shared by the toast store, routing, history and the
 * provider (contexts/NotificationContext).
 */

import type { SettingsSectionId, SidebarView } from '../navigation/views';

export type Severity = 'success' | 'info' | 'warning' | 'error';

/** What a notification is about; decides whether it may reach the OS. */
export type NotificationCategory =
  | 'general'
  | 'timer'
  | 'session'
  | 'task'
  | 'note'
  | 'template'
  | 'settings'
  | 'export'
  | 'backup'
  | 'workLog'
  | 'goal'
  | 'dailySummary'
  | 'longRun'
  | 'idle'
  | 'test';

/** A button on a toast: run something, or open a page. */
export type NotificationAction =
  | { label: string; onClick: () => void | Promise<void>; keepOpen?: boolean }
  | { label: string; view: SidebarView; section?: SettingsSectionId };

/**
 * Whether it may also go to the OS: `auto` when TaskMint isn't in front,
 * `always` (reminders), or `never`. Defaults come from the category.
 */
export type DesktopRoute = 'auto' | 'always' | 'never';

export interface NotifyOptions {
  message: string;
  title?: string;
  severity?: Severity;
  category?: NotificationCategory;
  /** At most two are shown. */
  actions?: NotificationAction[];
  /** How long the toast stays, in ms; null keeps it until dismissed. */
  duration?: number | null;
  /** Legacy aliases for `duration`. */
  persist?: boolean;
  autoHideDuration?: number;
  /** Toasts with the same key merge (a "×2" count) instead of stacking. */
  dedupeKey?: string;
  desktop?: DesktopRoute;
  /** false: don't keep it in the notification history (e.g. "Copied"). */
  history?: boolean;
}

/** The kinds the backend's show_desktop_notification understands. */
export type { NotificationKind as DesktopKind } from '@taskmint/contracts';
