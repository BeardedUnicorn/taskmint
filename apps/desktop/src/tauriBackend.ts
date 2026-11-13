/**
 * The client's Backend in the desktop app. Every call goes through the app's
 * one IPC command, `dispatch` (apps/desktop/src-tauri/src/dispatch.rs): data
 * commands by their own names, and the platform (dialogs, files, OS
 * notifications, idle time, backups) as the Rust shell's commands. Events are
 * Tauri events. In server mode the Rust side passes the data commands on to
 * the server and its events back, so nothing here changes.
 *
 * On a phone or tablet (runtime 'mobile') the platform is the files and
 * notifications only: there's no system idle time, tray, folder to back up
 * to, file manager or browser extension, so the client leaves those features
 * out, as it does in a browser. Its notifications can also be set for later,
 * as alarms the system shows with the app closed. On Android it also has the
 * status bar, which MainActivity.kt hands the webview directly, outside
 * dispatch, and the back button (Tauri's app plugin).
 */

import { onBackButtonPress } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CORE_ERRORS, type CommandName, type CommandReply } from '@taskmint/contracts';
import type {
  Backend,
  Capabilities,
  CommandArgsParam,
  NotificationPlatform,
  Platform,
  SavedFile,
} from '@taskmint/client/backend';
import type { AppInfo, MenuCommand } from '@taskmint/contracts';

/** What a dismissed save or open dialog rejects with. */
const { EXPORT_CANCELLED, IMPORT_CANCELLED } = CORE_ERRORS;

/** Runs a command in the app's Rust side (dispatch takes `{}` for no arguments). */
export function command<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('dispatch', { command: name, args });
}

/** The command's result, or null when it says the user dismissed its dialog. */
async function unlessCancelled<T>(result: Promise<T>, cancelled: string): Promise<T | null> {
  try {
    return await result;
  } catch (error) {
    if (error === cancelled) return null;
    throw error;
  }
}

/**
 * Tauri registers a listener asynchronously; unsubscribing before that
 * finishes still removes it once it exists.
 */
function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  let unlisten: (() => void) | null = null;
  let disposed = false;
  listen<T>(event, ({ payload }) => handler(payload)).then(
    stop => {
      if (disposed) stop();
      else unlisten = stop;
    },
    error => console.error(`Failed to listen for ${event}:`, error)
  );
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/** What the app has everywhere it runs: dialogs for files, OS notifications, and About's facts and links. */
const everywhere: Platform = {
  appInfo: () => command<AppInfo>('get_app_info'),
  openLink: link => command<void>('open_link', { link }),
  files: {
    save({ contents, suggestedName, format }) {
      // The path it went to, or null for a document Android's picker chose
      const saving =
        format === 'csv'
          ? command<string | null>('export_csv_file', { csv: contents, suggestedFilename: suggestedName })
          : command<string | null>('export_data_to_file', { dataJson: contents, suggestedFilename: suggestedName });
      return unlessCancelled<SavedFile>(
        saving.then(path => (path === null ? { kind: 'picked' } : { kind: 'path', path })),
        EXPORT_CANCELLED
      );
    },
    openJson: () => unlessCancelled(command<string>('import_data_from_file'), IMPORT_CANCELLED),
  },
  notifications: {
    show: (kind, title, body) => command<boolean>('show_desktop_notification', { kind, title, body }),
    setPreferences: prefs => command<void>('set_notification_preferences', { prefs }),
    takeOpened: () => command<MenuCommand | null>('take_opened_notification'),
  },
};

declare global {
  interface Window {
    /** MainActivity calls it when the user taps a notification while the app runs. */
    __taskmintNotificationTapped?: () => void;
  }
}

/**
 * A phone's notifications, which can also be set for later (alarms the
 * system shows with the app closed). Android's notification plugin reports a
 * tap without the notification it was on, so MainActivity.kt keeps the
 * tapped notification's id and button (window.TaskMintApp) and the page
 * hands them to Rust (notification_action), which knows the page from the
 * id: before it asks what a tap opens (the tap may have started the app),
 * and as soon as MainActivity says one came.
 */
function phoneNotifications(): NotificationPlatform {
  const android = (window as { TaskMintApp?: AndroidAppTask }).TaskMintApp;
  const actOnTap = async () => {
    const tap = android?.takeNotificationTap();
    if (tap) await command<void>('notification_action', JSON.parse(tap));
  };
  window.__taskmintNotificationTapped = () => void actOnTap();
  return {
    ...everywhere.notifications,
    schedule: ({ id, atMs, kind, title, body }) =>
      command<boolean>('schedule_notification', { id, at: new Date(atMs).toISOString(), kind, title, body }),
    cancel: id => command<void>('cancel_notification', { id }),
    askPermission: () => void command<void>('ask_to_notify'),
    takeOpened: async () => {
      await actOnTap();
      return command<MenuCommand | null>('take_opened_notification');
    },
  };
}

/** What only a desktop has. */
const desktopOnly: Omit<Platform, 'files' | 'notifications'> = {
  idle: {
    isSupported: () => command<boolean>('get_idle_support'),
    setSettings: settings => command<void>('set_idle_settings', { settings }),
    getPending: () => command('get_idle_pause'),
    resolve: choice => command<void>('resolve_idle_pause', { choice }),
  },
  tray: {
    setWithdrawalLabel: label => command<void>('set_tray_withdrawal', { label }),
  },
  folderBackups: {
    defaultFolder: () => command<string>('default_backup_dir'),
    pickFolder: () => command<string | null>('pick_backup_dir'),
    validateFolder: path => command('validate_backup_path', { path }),
    write: ({ folder, contents, maxBackups }) =>
      command('perform_automatic_backup', { backupPath: folder, currentDataJson: contents, maxBackups }),
    list: folder => command('list_backups', { folder }),
    read: (folder, name) => command<string>('read_backup', { folder, name }),
  },
  reveal: path => command<void>('reveal_path', { path }),
  openFolder: folder => command<void>('open_folder', { folder }),
  captureStatus: () => command('get_capture_server_status'),
};

/** What Android's MainActivity.kt adds to the webview, before the page loads. */
interface AndroidSystemBars {
  /** 'light' or 'dark': the status bar's icons then read on that theme. */
  setTheme(theme: string): void;
  /** The navigation bar or gesture area's height along the bottom, in dp (CSS px). */
  bottomInset(): number;
  /** The keyboard's height from the screen's bottom, in dp (0 while it's down). */
  keyboardInset(): number;
}

declare global {
  interface Window {
    /** MainActivity calls it when the bottom insets change. */
    __taskmintInsets?: () => void;
  }
}

/** What listens for MainActivity's inset changes. */
const insetListeners = new Set<() => void>();

/** What Android's MainActivity.kt adds for its launch screen. */
interface AndroidSplash {
  /** The page has drawn: the launch screen fades out. */
  hide(): void;
}

/** What Android's MainActivity.kt adds for Firebase Analytics. */
interface AndroidAnalytics {
  setEnabled(enabled: boolean): void;
  screen(name: string): void;
}

/**
 * Usage analytics on Android (its native SDK); the desktop has none. A dev
 * build has none either: its Gradle build switches Analytics off
 * (firebase_analytics_collection_deactivated), so there's nothing for
 * Settings → Privacy to turn on, as on the dev web app.
 */
function analytics(): Pick<Platform, 'analytics'> {
  const android = (window as { TaskMintAnalytics?: AndroidAnalytics }).TaskMintAnalytics;
  return android && import.meta.env.TASKMINT_ENV === 'production'
    ? { analytics: { setEnabled: enabled => android.setEnabled(enabled), screen: name => android.screen(name) } }
    : {};
}

/** The status bar on Android; elsewhere there's none to set. */
function systemBars(): Pick<Platform, 'systemBars'> {
  const android = (window as { TaskMintSystemBars?: AndroidSystemBars }).TaskMintSystemBars;
  // Called on the bridge itself: Android refuses a method taken off it
  if (!android) return {};
  return {
    systemBars: {
      setTheme: theme => android.setTheme(theme),
      bottomInset: () => android.bottomInset(),
      keyboardInset: () => android.keyboardInset(),
      onInsetsChange: listener => {
        insetListeners.add(listener);
        window.__taskmintInsets = () => {
          for (const each of [...insetListeners]) each();
        };
        return () => {
          insetListeners.delete(listener);
        };
      },
    },
  };
}

/** The launch screen on Android; the desktop has none. */
function splashScreen(): Pick<Platform, 'splashScreen'> {
  const android = (window as { TaskMintSplash?: AndroidSplash }).TaskMintSplash;
  return android ? { splashScreen: { hide: () => android.hide() } } : {};
}

/** What Android's MainActivity.kt adds for leaving the app from its first screen, and notification taps. */
interface AndroidAppTask {
  /** Puts the app in the background (Activity.moveTaskToBack). */
  moveToBack(): void;
  /** The notification tap the app hasn't acted on, as JSON `{ id, action }`, once; null when none. */
  takeNotificationTap(): string | null;
}

/**
 * Android's back button: Tauri's app plugin hands each press to the page
 * while it listens, and MainActivity.kt sends the app to the background.
 */
function backButton(): Pick<Platform, 'backButton'> {
  const android = (window as { TaskMintApp?: AndroidAppTask }).TaskMintApp;
  if (!android) return {};
  return {
    backButton: {
      listen: async handler => {
        const listener = await onBackButtonPress(() => handler());
        return () => void listener.unregister();
      },
      leaveApp: () => android.moveToBack(),
    },
  };
}

/** The "Desktop app" OAuth client Google sign-in uses (the build's VITE_GOOGLE_DESKTOP_CLIENT_*). */
export interface GoogleDesktopClient {
  clientId: string;
  clientSecret: string;
}

/** What Android's MainActivity.kt adds for Google sign-in (Credential Manager). */
interface AndroidGoogleSignIn {
  /** Shows the account picker; the answer comes to `window.__taskmintGoogleSignIn`. */
  start(): void;
}

type GoogleAnswer = { idToken: string } | { error: string };

declare global {
  interface Window {
    __taskmintGoogleSignIn?: (answer: GoogleAnswer) => void;
  }
}

/** Google sign-in: Android's account picker, or the desktop's browser when the build has a client. */
function googleSignIn(runtime: Capabilities['runtime'], client?: GoogleDesktopClient): Pick<Platform, 'googleSignIn'> {
  if (runtime === 'mobile') {
    const android = (window as { TaskMintGoogleSignIn?: AndroidGoogleSignIn }).TaskMintGoogleSignIn;
    if (!android) return {};
    return {
      googleSignIn: () =>
        new Promise<string>((resolve, reject) => {
          window.__taskmintGoogleSignIn = answer =>
            'idToken' in answer ? resolve(answer.idToken) : reject(answer.error);
          android.start();
        }),
    };
  }
  if (!client) return {};
  return {
    googleSignIn: theme =>
      command<{ idToken: string }>('google_sign_in', { ...client, colorMode: theme }).then(({ idToken }) => idToken),
  };
}

/** `capabilities` are what get_capabilities said, before the client started. */
export function createTauriBackend(capabilities: Capabilities, google?: GoogleDesktopClient): Backend {
  return {
    capabilities,
    call<K extends CommandName>(name: K, ...args: CommandArgsParam<K>) {
      return command<CommandReply<K>>(name, args[0] as Record<string, unknown> | undefined);
    },
    subscribe,
    platform: {
      ...everywhere,
      ...(capabilities.runtime === 'mobile'
        ? { notifications: phoneNotifications(), ...systemBars(), ...splashScreen(), ...backButton(), ...analytics() }
        : desktopOnly),
      ...googleSignIn(capabilities.runtime, google),
    },
  };
}
