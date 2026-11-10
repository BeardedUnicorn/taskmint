/**
 * The app's pages (sidebar order) and the settings sections a link can open.
 */

export const VIEWS = ['sessions', 'tasks', 'notes', 'history', 'calendar', 'payouts', 'settings'] as const;

export type SidebarView = (typeof VIEWS)[number];

export const VIEW_LABELS: Record<SidebarView, string> = {
  sessions: 'Sessions',
  tasks: 'Tasks',
  notes: 'Notes',
  history: 'History',
  calendar: 'Calendar',
  payouts: 'Payouts',
  settings: 'Settings',
};

export type SettingsSectionId =
  | 'appearance'
  | 'payouts'
  | 'idle'
  | 'goal'
  | 'notifications'
  | 'backups'
  | 'data'
  | 'sync'
  | 'privacy'
  | 'about';

/** Settings' sections, in page order, as its section list names them. */
export const SETTINGS_SECTION_LABELS: Record<SettingsSectionId, string> = {
  appearance: 'Appearance',
  payouts: 'Payouts',
  idle: 'Idle & Reminders',
  goal: 'Daily Goal',
  notifications: 'Notifications',
  backups: 'Backups',
  data: 'Data',
  sync: 'Cloud sync',
  privacy: 'Privacy',
  about: 'About',
};

/** Extra context for the page being opened (cleared once the page has used it). */
export interface NavigationParams {
  /** Settings: the section to show. */
  section?: SettingsSectionId;
  /** History: show this task's entries. */
  focusTaskId?: string;
  /** Tasks: open the new-task form. */
  intent?: 'new-task';
}

export function isSidebarView(value: unknown): value is SidebarView {
  return typeof value === 'string' && (VIEWS as readonly string[]).includes(value);
}

/**
 * The Settings sections this platform can use: idle detection and folder
 * backups need the desktop app.
 */
export function availableSettingsSections(
  platform: { idle?: unknown; folderBackups?: unknown },
  syncs: boolean
): SettingsSectionId[] {
  return (Object.keys(SETTINGS_SECTION_LABELS) as SettingsSectionId[]).filter(
    id =>
      (id !== 'idle' || platform.idle !== undefined) &&
      (id !== 'backups' || platform.folderBackups !== undefined) &&
      (id !== 'sync' || syncs)
  );
}
