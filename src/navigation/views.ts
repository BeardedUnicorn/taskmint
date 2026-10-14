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
  | 'privacy';

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
