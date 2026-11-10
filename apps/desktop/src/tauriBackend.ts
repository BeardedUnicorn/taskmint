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
 * out, as it does in a browser. On Android it also has the status bar, which
 * MainActivity.kt hands the webview directly, outside dispatch.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CORE_ERRORS, type CommandName, type CommandReply } from '@taskmint/contracts';
import type { Backend, Capabilities, CommandArgsParam, Platform, SavedFile } from '@taskmint/client/backend';

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

/** What the app has everywhere it runs: dialogs for files, and OS notifications. */
const everywhere: Platform = {
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
  },
};

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
  captureStatus: () => command('get_capture_server_status'),
};

/** What Android's MainActivity.kt adds to the webview, before the page loads. */
interface AndroidSystemBars {
  /** 'light' or 'dark': the status bar's icons then read on that theme. */
  setTheme(theme: string): void;
}

/** The status bar on Android; elsewhere there's none to set. */
function systemBars(): Pick<Platform, 'systemBars'> {
  const android = (window as { TaskMintSystemBars?: AndroidSystemBars }).TaskMintSystemBars;
  // Called on the bridge itself: Android refuses a method taken off it
  return android ? { systemBars: { setTheme: theme => android.setTheme(theme) } } : {};
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
    googleSignIn: () => command<{ idToken: string }>('google_sign_in', { ...client }).then(({ idToken }) => idToken),
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
      ...(capabilities.runtime === 'mobile' ? systemBars() : desktopOnly),
      ...googleSignIn(capabilities.runtime, google),
    },
  };
}
