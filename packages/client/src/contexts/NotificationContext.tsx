/**
 * Notifications: toasts in the window, OS notifications, and the history the
 * sidebar bell shows.
 *
 * `useNotification()` is the API (stable: it never changes identity, so
 * sending a toast doesn't re-render the app). `notify()` decides where each
 * notification goes (see notifications/routing): a toast, the OS, or both.
 * `useNotificationState()` is for the toast viewport and the bell.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  ReactNode,
} from 'react';
import { ToastStore, HoldReason } from '../notifications/store';
import { routeNotification, ErrorThrottle } from '../notifications/routing';
import { deliverDesktop } from '../notifications/desktop';
import { isWindowAttended, subscribeAttention } from '../notifications/attention';
import { useNotificationPreferences } from '../notifications/preferences';
import {
  HistoryEntry,
  NOTIFICATION_HISTORY_KEY,
  addHistoryEntry,
  bumpHistoryEntry,
  markAllRead as markAllEntriesRead,
  markHistoryUnread,
  normalizeHistory,
  persistableActions,
  unreadCount,
} from '../notifications/history';
import type {
  DesktopKind,
  NotificationAction,
  NotificationCategory,
  NotifyOptions,
  Severity,
} from '../notifications/types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { BACKEND_EVENTS } from '../constants/events';
import { getBackend, useBackendEvent } from '../backend';
import { useOptionalNavigation } from './NavigationContext';
import { ToastViewport } from '../components/notifications/ToastViewport';

export type { NotifyOptions, NotificationAction, Severity, NotificationCategory };
/** Options for the show* shorthands (severity comes from the method). */
export type NotificationOptions = Omit<NotifyOptions, 'message' | 'severity'>;

export interface NotificationApi {
  /** Sends a notification where it should go (see notifications/routing). */
  notify: (options: NotifyOptions) => void;
  showSuccess: (message: string, options?: NotificationOptions) => void;
  showError: (message: string, options?: NotificationOptions) => void;
  showWarning: (message: string, options?: NotificationOptions) => void;
  showInfo: (message: string, options?: NotificationOptions) => void;
}

/** The history, for the sidebar bell. */
export interface NotificationState {
  history: HistoryEntry[];
  unread: number;
  markAllRead: () => void;
  clearHistory: () => void;
  /** Runs a history button (opens its page, or calls it). */
  runAction: (action: NotificationAction) => void;
}

const NotificationApiContext = createContext<NotificationApi | null>(null);
const NotificationStateContext = createContext<NotificationState | null>(null);

/** A notification the backend showed itself (long-run reminder, idle pause). */
interface PostedNotification {
  id: string;
  kind: DesktopKind;
  title: string;
  body: string;
  at: string;
}

const BACKEND_KIND_CATEGORY: Partial<Record<DesktopKind, NotificationCategory>> = {
  longRun: 'longRun',
  idlePause: 'idle',
};

/** Identical notifications this close together merge in the history. */
const HISTORY_MERGE_MS = 60_000;

let nextHistoryId = 0;
const newHistoryId = () => `notification-${Date.now()}-${++nextHistoryId}`;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new ToastStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const [storedHistory, setStoredHistory] = useLocalStorage<unknown>(NOTIFICATION_HISTORY_KEY, []);
  const history = useMemo(() => normalizeHistory(storedHistory), [storedHistory]);
  const updateHistory = useCallback(
    (change: (history: HistoryEntry[]) => HistoryEntry[]) =>
      setStoredHistory((previous: unknown) => change(normalizeHistory(previous))),
    [setStoredHistory]
  );

  const [preferences] = useNotificationPreferences();
  const preferencesRef = useRef(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  // The shell applies the same preferences to the notifications it shows.
  useEffect(() => {
    const notifications = getBackend().platform.notifications;
    if (!notifications.setPreferences) return;
    notifications.setPreferences(preferences).catch(error =>
      console.error('Failed to send notification preferences:', error)
    );
  }, [preferences]);

  // While you're away, toasts wait (their time doesn't run) and errors may go
  // to the OS; coming back starts the error allowance over.
  const attended = useSyncExternalStore(subscribeAttention, isWindowAttended);
  const throttle = useRef(new ErrorThrottle()).current;
  useEffect(() => {
    store.setWindowHeld(!attended);
    if (attended) throttle.reset();
  }, [attended, store, throttle]);

  const navigation = useOptionalNavigation();
  const navigationRef = useRef(navigation);
  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  // A queued toast dropped unseen stays unread in the history
  useEffect(() => {
    store.onDropped = toast => {
      if (toast.historyId) updateHistory(entries => markHistoryUnread(entries, toast.historyId!));
    };
    return () => {
      store.onDropped = undefined;
    };
  }, [store, updateHistory]);

  const recentByKey = useRef(new Map<string, { historyId: string; at: number }>()).current;

  /** Adds (or merges) the history entry for a notification; returns its id. */
  const record = useCallback(
    (key: string, entry: Omit<HistoryEntry, 'id' | 'count'>): string => {
      const now = Date.now();
      const recent = recentByKey.get(key);
      if (recent && now - recent.at < HISTORY_MERGE_MS) {
        recent.at = now;
        updateHistory(entries =>
          bumpHistoryEntry(entries, recent.historyId, {
            at: entry.at,
            message: entry.message,
            title: entry.title,
            read: entry.read,
          })
        );
        return recent.historyId;
      }
      const id = newHistoryId();
      recentByKey.set(key, { historyId: id, at: now });
      updateHistory(entries => addHistoryEntry(entries, { ...entry, id, count: 1 }));
      return id;
    },
    [recentByKey, updateHistory]
  );

  const notify = useCallback(
    (options: NotifyOptions): void => {
      const severity = options.severity ?? 'info';
      const category = options.category ?? 'general';
      const key = options.dedupeKey ?? `${severity}|${category}|${options.title ?? ''}|${options.message}`;
      const isAttended = isWindowAttended();

      let decision = routeNotification(
        { category, severity, desktop: options.desktop },
        { attended: isAttended, preferences: preferencesRef.current }
      );
      if (decision.desktop === 'error' && !throttle.allow(key)) {
        decision = { ...decision, desktop: null };
      }
      if (!decision.toast && !decision.desktop) return;

      const historyId =
        options.history === false
          ? undefined
          : record(key, {
              at: new Date().toISOString(),
              severity,
              title: options.title,
              message: options.message,
              category,
              origin: 'app',
              delivery: decision.toast && decision.desktop ? 'both' : decision.desktop ? 'desktop' : 'toast',
              // Seen if it showed in the window while you were there
              read: decision.toast && isAttended,
              actions: persistableActions(options.actions),
            });

      const toastInput = {
        key,
        severity,
        title: options.title,
        message: options.message,
        category,
        actions: options.actions,
        duration: options.duration,
        historyId,
      };
      if (decision.toast) store.add(toastInput);

      if (decision.desktop) {
        const shownInWindow = decision.toast;
        void deliverDesktop(decision.desktop, options.title ?? 'TaskMint', options.message).then(shown => {
          // The OS didn't show it (no permission, or a category turned off): say it here
          if (!shown && !shownInWindow) store.add(toastInput);
        });
      }
    },
    [record, store, throttle]
  );

  const api = useMemo<NotificationApi>(() => {
    const withSeverity = (severity: Severity) => (message: string, options?: NotificationOptions) =>
      notify({ ...options, message, severity });
    return {
      notify,
      showSuccess: withSeverity('success'),
      showError: withSeverity('error'),
      showWarning: withSeverity('warning'),
      showInfo: withSeverity('info'),
    };
  }, [notify]);

  // What the backend showed itself joins the history (and, while you're
  // looking at the app, shows here too).
  useBackendEvent<PostedNotification>(BACKEND_EVENTS.NOTIFICATION_POSTED, payload => {
    const category = BACKEND_KIND_CATEGORY[payload.kind] ?? 'general';
    const severity: Severity = payload.kind === 'idlePause' ? 'warning' : 'info';
    const isAttended = isWindowAttended();
    const key = `backend|${payload.kind}|${payload.body}`;
    const historyId = record(key, {
      at: payload.at,
      severity,
      title: payload.title,
      message: payload.body,
      category,
      origin: 'backend',
      delivery: isAttended ? 'both' : 'desktop',
      read: false,
    });
    if (isAttended) {
      store.add({ key, severity, title: payload.title, message: payload.body, category, historyId });
    }
  });

  // A button opens its page or runs; on a toast, it dismisses the toast too
  const runAction = useCallback((action: NotificationAction) => {
    if ('view' in action) {
      navigationRef.current?.navigate(action.view, action.section ? { section: action.section } : undefined);
      return;
    }
    Promise.resolve()
      .then(action.onClick)
      .catch(error => console.error(`Notification action "${action.label}" failed:`, error));
  }, []);
  const runToastAction = useCallback(
    (action: NotificationAction, toastId: string) => {
      runAction(action);
      store.dismiss(toastId);
    },
    [runAction, store]
  );
  const dismiss = useCallback((id: string) => store.dismiss(id), [store]);

  const markAllRead = useCallback(() => updateHistory(markAllEntriesRead), [updateHistory]);
  const clearHistory = useCallback(() => {
    recentByKey.clear();
    updateHistory(() => []);
  }, [recentByKey, updateHistory]);
  const hold = useCallback((id: string, reason: HoldReason) => store.hold(id, reason), [store]);
  const release = useCallback((id: string, reason: HoldReason) => store.release(id, reason), [store]);

  const state = useMemo<NotificationState>(
    () => ({ history, unread: unreadCount(history), markAllRead, clearHistory, runAction }),
    [history, markAllRead, clearHistory, runAction]
  );

  return (
    <NotificationApiContext.Provider value={api}>
      <NotificationStateContext.Provider value={state}>
        {children}
        <ToastViewport
          toasts={snapshot.visible}
          onDismiss={dismiss}
          onAction={runToastAction}
          onHold={hold}
          onRelease={release}
        />
      </NotificationStateContext.Provider>
    </NotificationApiContext.Provider>
  );
}

export function useNotification(): NotificationApi {
  const context = useContext(NotificationApiContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

export function useNotificationState(): NotificationState {
  const context = useContext(NotificationStateContext);
  if (!context) {
    throw new Error('useNotificationState must be used within a NotificationProvider');
  }
  return context;
}
