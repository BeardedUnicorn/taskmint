/**
 * Recent notifications, for the sidebar bell: every toast and OS
 * notification of the last two weeks (at most 50), so one you missed can
 * still be read. Kept in localStorage. Only buttons that open a page are
 * kept with an entry: Undo, Retry and the like only make sense on the toast.
 */

import type { SettingsSectionId, SidebarView } from '../navigation/views';
import { isSidebarView } from '../navigation/views';
import type { NotificationAction, NotificationCategory, Severity } from './types';

export const NOTIFICATION_HISTORY_KEY = 'notificationHistory';
export const MAX_HISTORY_ENTRIES = 50;
export const HISTORY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface HistoryAction {
  label: string;
  view: SidebarView;
  section?: SettingsSectionId;
}

export interface HistoryEntry {
  id: string;
  /** ISO time it (last) arrived. */
  at: string;
  severity: Severity;
  title?: string;
  message: string;
  category: NotificationCategory;
  /** Sent by the app itself, or shown by the backend (long-run, idle pause). */
  origin: 'app' | 'backend';
  /** How it reached you. */
  delivery: 'toast' | 'desktop' | 'both';
  /** Times it arrived (identical ones merge). */
  count: number;
  read: boolean;
  actions?: HistoryAction[];
}

/** The buttons worth keeping: those that open a page. */
export function persistableActions(actions: NotificationAction[] | undefined): HistoryAction[] | undefined {
  const kept = (actions ?? []).flatMap(action =>
    'view' in action ? [{ label: action.label, view: action.view, section: action.section }] : []
  );
  return kept.length > 0 ? kept : undefined;
}

const SEVERITIES: readonly Severity[] = ['success', 'info', 'warning', 'error'];

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'string' &&
    !Number.isNaN(Date.parse(entry.at)) &&
    typeof entry.message === 'string' &&
    SEVERITIES.includes(entry.severity as Severity)
  );
}

/** Saved history made safe: readable entries only, newest first, within the cap and age. */
export function normalizeHistory(value: unknown, now = Date.now()): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isHistoryEntry)
    .map(entry => ({
      ...entry,
      count: typeof entry.count === 'number' && entry.count > 0 ? entry.count : 1,
      read: entry.read === true,
      actions: entry.actions?.filter(action => isSidebarView(action.view)),
    }))
    .filter(entry => now - Date.parse(entry.at) <= HISTORY_MAX_AGE_MS)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_HISTORY_ENTRIES);
}

/** Adds an entry at the top (keeping the cap). */
export function addHistoryEntry(history: HistoryEntry[], entry: HistoryEntry, now = Date.now()): HistoryEntry[] {
  return normalizeHistory([entry, ...history], now);
}

/** A repeat of an entry: newer time and text, one more arrival, unread again if it was missed. */
export function bumpHistoryEntry(
  history: HistoryEntry[],
  id: string,
  changes: Pick<HistoryEntry, 'at' | 'message' | 'title' | 'read'>
): HistoryEntry[] {
  return history.map(entry =>
    entry.id === id
      ? { ...entry, ...changes, read: entry.read && changes.read, count: entry.count + 1 }
      : entry
  );
}

export function markHistoryUnread(history: HistoryEntry[], id: string): HistoryEntry[] {
  return history.map(entry => (entry.id === id ? { ...entry, read: false } : entry));
}

export function markAllRead(history: HistoryEntry[]): HistoryEntry[] {
  return history.some(entry => !entry.read) ? history.map(entry => ({ ...entry, read: true })) : history;
}

export function unreadCount(history: HistoryEntry[]): number {
  return history.filter(entry => !entry.read).length;
}
