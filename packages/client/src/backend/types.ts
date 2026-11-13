/**
 * What the client needs from the shell it runs in (the desktop app today, a
 * browser against a TaskMint server later). The client never imports a
 * shell's APIs: each shell builds a Backend and hands it to startClient.
 *
 * Data commands go through `call`, typed by the backend's own CommandMap
 * (@taskmint/contracts, generated from the Rust), and reject with the
 * backend's reason as a plain string. Events arrive through `subscribe`. Everything that depends on the
 * machine (files, OS notifications, idle time, backup folders) is `platform`.
 * An optional platform feature is absent where it can't work, and the client
 * leaves out what depends on it.
 */

import type { CommandArgs, CommandName, CommandReply, EventName } from '@taskmint/contracts';
import type { DesktopKind } from '../notifications/types';
import type { NotificationPreferences } from '../notifications/preferences';
import type { BackupFileInfo, BackupResult } from '../types/backup';
import type { IdleChoice, IdlePause, InactivitySettings } from '../types/timer';
import type { AppFolder, AppInfo, AppLink, CaptureServerStatus } from '@taskmint/contracts';

export interface Capabilities {
  /**
   * The shell the client runs in: the desktop app, the same app on a phone or
   * tablet (Android, iOS), or a browser.
   */
  runtime: 'desktop' | 'mobile' | 'web';
  /**
   * Where tracked time lives: on this device (synced with the cloud once
   * signed in), or only in the cloud (the web app, whose page holds a copy).
   */
  dataLocation: 'local' | 'cloud';
}

/**
 * Where a saved file went: a path on disk, a browser download, or a place the
 * system's own picker chose (on a phone), which has no path to show.
 */
export type SavedFile = { kind: 'path'; path: string } | { kind: 'download'; name: string } | { kind: 'picked' };

export interface FilePlatform {
  /** Asks where to save `contents` and saves it there. Null when the user cancels. */
  save(file: { contents: string; suggestedName: string; format: 'json' | 'csv' }): Promise<SavedFile | null>;
  /** Asks for a JSON file and reads it. Null when the user cancels. */
  openJson(): Promise<string | null>;
}

/** An OS notification for the system to show later. */
export interface LaterNotification {
  /** Setting another with the same id replaces it. */
  id: number;
  atMs: number;
  kind: DesktopKind;
  title: string;
  body: string;
}

export interface NotificationPlatform {
  /** Shows an OS notification; resolves to whether one was shown. */
  show(kind: DesktopKind, title: string, body: string): Promise<boolean>;
  /**
   * Sets a notification for the system to show at its time, even with the
   * app closed (a phone's alarm). Resolves to whether it was set: not when
   * the preferences turn it off or the time has passed. Absent where the
   * app has to be running to notify (a desktop, a browser).
   */
  schedule?(notification: LaterNotification): Promise<boolean>;
  /** Takes back the notification set with `id`; present along with `schedule`. */
  cancel?(id: number): Promise<void>;
  /** The preferences for notifications the shell raises itself (the long-run reminder, idle pauses). */
  setPreferences?(preferences: NotificationPreferences): Promise<void>;
}

/** System idle time: pausing a timer while you're away, and the long-run reminder. */
export interface IdlePlatform {
  /** Whether this OS reports idle time. */
  isSupported(): Promise<boolean>;
  setSettings(settings: InactivitySettings): Promise<void>;
  /** The "you were away" question raised before the client was listening. */
  getPending(): Promise<IdlePause | null>;
  resolve(choice: IdleChoice): Promise<void>;
}

/** Automatic backups into a folder on this computer. */
export interface FolderBackupPlatform {
  /** Where backups go until the user picks a folder; null when there's no Documents folder. */
  defaultFolder(): Promise<string | null>;
  /** Asks for a folder. Null when the user cancels. */
  pickFolder(): Promise<string | null>;
  validateFolder(path: string): Promise<{ isValid: boolean; error?: string }>;
  /** Writes a backup and keeps the newest `maxBackups`. */
  write(backup: { folder: string; contents: string; maxBackups: number }): Promise<BackupResult>;
  /** The backups in `folder`, newest first, each checked to read as an export (none when it isn't there). */
  list(folder: string): Promise<BackupFileInfo[]>;
  /** One of them, by the name `list` gave, to restore from. */
  read(folder: string, name: string): Promise<string>;
}

/** The system tray's menu (desktop). */
export interface TrayPlatform {
  /** The menu's line about the next withdrawal; null removes it. */
  setWithdrawalLabel(label: string | null): Promise<void>;
}

/**
 * A phone's status bar, which the app draws under (Android). It follows the
 * app's own light or dark theme, not the system's.
 */
export interface SystemBarsPlatform {
  /** Draws the clock and icons to read on this theme. */
  setTheme(theme: 'light' | 'dark'): void;
}

/**
 * A phone's launch screen (Android), which stays over the app until the app
 * has drawn, so a cold start shows TaskMint instead of a blank page.
 */
export interface SplashScreenPlatform {
  /** The app is on screen: the launch screen fades out. Later calls do nothing. */
  hide(): void;
}

/**
 * A phone's back gesture and button (Android). Left to itself, Android's
 * back leaves the app from any page, even with a dialog open; the app takes
 * it over to close what's open and step back first.
 */
export interface BackButtonPlatform {
  /** Calls `handler` on each press, in place of Android's own back. Resolves to a function that stops it. */
  listen(handler: () => void): Promise<() => void>;
  /** Sends the app to the background, as back does from an app's first screen. */
  leaveApp(): void;
}

/** Usage analytics (Firebase Analytics): the web app's, and Android's native SDK. */
export interface AnalyticsPlatform {
  /** On or off, as Settings → Privacy says. */
  setEnabled(enabled: boolean): void;
  /** A page the app showed. */
  screen(name: string): void;
}

export interface Platform {
  files: FilePlatform;
  notifications: NotificationPlatform;
  idle?: IdlePlatform;
  folderBackups?: FolderBackupPlatform;
  tray?: TrayPlatform;
  systemBars?: SystemBarsPlatform;
  splashScreen?: SplashScreenPlatform;
  backButton?: BackButtonPlatform;
  /** Shows a file the app just wrote in the file manager. */
  reveal?(path: string): Promise<void>;
  /** The localhost server the browser extension delivers captures to. */
  captureStatus?(): Promise<CaptureServerStatus>;
  /**
   * Google sign-in for cloud sync, the shell's own way (the desktop's
   * system browser, Android's account picker): the Google ID token. Absent
   * where the browser's popup does it, or the build has no client for it.
   * `theme` is the app's: the desktop's browser comes back to a page in it.
   */
  googleSignIn?(theme: 'light' | 'dark'): Promise<string>;
  analytics?: AnalyticsPlatform;
  /** What this copy of TaskMint is and where its files are (About). Absent in a browser. */
  appInfo?(): Promise<AppInfo>;
  /** Opens one of TaskMint's pages (its repository, help, a new issue, the releases) in the browser. */
  openLink?(link: AppLink): Promise<void>;
  /** Shows the data or logs folder in the file manager (desktop). */
  openFolder?(folder: AppFolder): Promise<void>;
}

/** A command's arguments, left out for a command that takes none. */
export type CommandArgsParam<K extends CommandName> = CommandArgs<K> extends void ? [] : [args: CommandArgs<K>];

export interface Backend {
  readonly capabilities: Capabilities;
  call<K extends CommandName>(command: K, ...args: CommandArgsParam<K>): Promise<CommandReply<K>>;
  /** Calls `handler` with each payload of `event` until the returned function is called. */
  subscribe<T = unknown>(event: EventName, handler: (payload: T) => void): () => void;
  readonly platform: Platform;
}
