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
import type { AppFolder, AppInfo, AppLink, CaptureServerStatus, MenuCommand } from '@taskmint/contracts';

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
  /**
   * Asks the user to let the app notify (Android 13 and later), unless they
   * already answered. Absent where the system doesn't need asking first.
   */
  askPermission?(): void;
  /**
   * What the notification the user last tapped opens (a page, a dialog), or
   * null, once. The app asks when it starts (a tap can start it) and on each
   * `notification-opened` event. Absent where a tap can't say (a browser).
   */
  takeOpened?(): Promise<MenuCommand | null>;
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
  /**
   * How much of the screen's bottom (CSS px) the navigation bar or gesture
   * area covers. The app draws under it too, and the webview doesn't report
   * it to CSS (env(safe-area-inset-bottom) is 0).
   */
  bottomInset(): number;
  /**
   * How much of the screen's bottom (CSS px) the on-screen keyboard covers,
   * 0 while it's down. Older webviews don't shrink the visual viewport for
   * it.
   */
  keyboardInset(): number;
  /** Calls `listener` when either inset changes. Returns a function that stops it. */
  onInsetsChange(listener: () => void): () => void;
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

/**
 * A launcher shortcut (Android: long-press the app's icon). It opens the app
 * for `action` (LAUNCH_ACTIONS).
 */
export interface AppShortcut {
  /** Stays the same for the same shortcut, so the launcher keeps a pinned one. */
  id: string;
  /** Short, for where there's little room. */
  label: string;
  longLabel: string;
  icon: 'task' | 'addTime' | 'payouts';
  action: string;
}

/** The launcher's shortcuts to the app (Android). */
export interface AppShortcutsPlatform {
  /** In the order shown, the first nearest the icon. Replaces those set before. */
  set(shortcuts: AppShortcut[]): void;
}

/**
 * What the home-screen widgets show (Android), as the app works it out:
 * text ready to show, and the times the widgets count from or check. Each
 * widget reads its own part (Today: `today` and `timer`; Payouts; the
 * Calendar's `agenda`; the This week chart's `week`).
 */
export interface WidgetSnapshot {
  /** The widgets read only this version: an older snapshot shows "Open TaskMint…" until a new one comes. */
  version: 2;
  updatedAtMs: number;
  /** The local day (YYYY-MM-DD) the figures are for: once it's past, Today says "Yesterday" or the date. */
  day: string;
  today: {
    /** "~$45": an estimate is marked. */
    money: string;
    time: string;
    goalPercent: number | null;
    /** This week's money and time, as Home has them (a tall widget shows them). */
    week: { money: string; time: string };
  };
  /** The live timer; null when nothing runs or waits paused. */
  timer: {
    task: string;
    /** While it runs: when it would have started had it never paused (the widget's clock counts from it). */
    countingFromMs: number | null;
    /** While paused: "Paused at 1h 23m". */
    status: string | null;
    /** While paused: how long it ran, "1h 23m" (one row tall, the big line). */
    pausedFor: string | null;
  } | null;
  /** The next withdrawal, else the next release; null when neither is on the way. */
  payouts: WidgetPayouts | null;
  agenda: WidgetAgenda;
  week: WidgetWeek;
}

export interface WidgetPayouts {
  /** "Next withdrawal", or "Next release" until a withdrawal is recorded. */
  label: string;
  amount: string;
  /** "Opens Mon, Nov 10, 6:25 PM", "Ready to withdraw", or the release's day. */
  status: string;
  isOpen: boolean;
  /** When the next withdrawal opens: the widget says "Ready to withdraw" from then. */
  opensAtMs: number | null;
  /** "Next release Fri, Nov 14 · $230", under a withdrawal. */
  nextRelease: string | null;
  /** What to do for more, when there's no withdrawal to plan from. */
  hint: string | null;
  /** The next few release days, soonest first: a tall widget lists them. */
  releases: { day: string; amount: string }[];
}

/** A day's badge in the Calendar: money released (or still to be), a withdrawal, the next withdrawal's opening. */
export type WidgetBadgeKind = 'release' | 'releaseAhead' | 'withdrawal' | 'opens' | 'openNow';

/** Where a day sits in its week's card: its corners round at the card's top and bottom. */
export type WidgetRowPosition = 'top' | 'middle' | 'bottom' | 'single';

export type WidgetAgendaRow =
  | {
      kind: 'week';
      /** The week's first day (YYYY-MM-DD). */
      date: string;
      /** "Week of Nov 8" */
      title: string;
      /** "20h 22m · ~$402", or null for a week with no work. */
      totals: string | null;
    }
  | {
      kind: 'day';
      date: string;
      /** "Fri" */
      weekday: string;
      dayOfMonth: string;
      isToday: boolean;
      time: string | null;
      goalPercent: number | null;
      money: string | null;
      badges: { kind: WidgetBadgeKind; text: string }[];
      position: WidgetRowPosition;
      /** The day in words, for screen readers. */
      spoken: string;
    };

/** The Calendar widget's list: the phone's Calendar agenda, from recent weeks to the upcoming releases. */
export interface WidgetAgenda {
  /** "November" */
  month: string;
  /** This month's money so far, or null for none. */
  monthMoney: string | null;
  rows: WidgetAgendaRow[];
  /** This week's header row: the list opens there. */
  thisWeekIndex: number;
}

/** The This week chart: a bar a day, Sunday to Saturday. */
export interface WidgetWeek {
  /** "~$402 · 14h 5m" */
  totals: string;
  /** What the bars measure: money, or time when the week has no money (no rates). */
  measure: 'money' | 'time';
  /** Where the daily goal's line is (0–10000 of the chart's height), or null for none. */
  goalLevel: number | null;
  days: {
    /** "S" */
    letter: string;
    /** The bar's height, 0–10000 of the chart's. */
    level: number;
    /** "$65", "2h 10m", or "" for nothing. */
    amount: string;
    isToday: boolean;
    isFuture: boolean;
    spoken: string;
  }[];
}

/** The home-screen widgets (Android): they show the latest snapshot sent. */
export interface WidgetsPlatform {
  update(snapshot: WidgetSnapshot): void;
}

/** Touch feedback as the timer starts or resumes, pauses, or stops. */
export type HapticKind = 'start' | 'pause' | 'stop';

/** A band of the screen, in CSS px. */
export interface ScreenArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a swipe in from the screen's left edge opens the menu (Android): the
 * system's back gesture leaves that band to the app.
 */
export interface EdgeSwipePlatform {
  /** The band, or null for none. */
  setArea(area: ScreenArea | null): void;
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
  appShortcuts?: AppShortcutsPlatform;
  widgets?: WidgetsPlatform;
  /** A short buzz (Android), as the phone's touch feedback setting allows. */
  haptics?(kind: HapticKind): void;
  edgeSwipe?: EdgeSwipePlatform;
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
