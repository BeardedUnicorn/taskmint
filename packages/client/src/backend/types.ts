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
import type { BackupResult } from '../types/backup';
import type { IdleChoice, IdlePause, InactivitySettings } from '../types/timer';
import type { CaptureServerStatus } from '@taskmint/contracts';

export interface Capabilities {
  /** The shell the client runs in. */
  runtime: 'desktop' | 'web';
  /** Where tracked time lives: on this computer, or on a TaskMint server. */
  dataLocation: 'local' | 'server';
}

/** Where a saved file went: a path on disk, or a browser download. */
export type SavedFile = { kind: 'path'; path: string } | { kind: 'download'; name: string };

export interface FilePlatform {
  /** Asks where to save `contents` and saves it there. Null when the user cancels. */
  save(file: { contents: string; suggestedName: string; format: 'json' | 'csv' }): Promise<SavedFile | null>;
  /** Asks for a JSON file and reads it. Null when the user cancels. */
  openJson(): Promise<string | null>;
}

export interface NotificationPlatform {
  /** Shows an OS notification; resolves to whether one was shown. */
  show(kind: DesktopKind, title: string, body: string): Promise<boolean>;
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
}

export interface Platform {
  files: FilePlatform;
  notifications: NotificationPlatform;
  idle?: IdlePlatform;
  folderBackups?: FolderBackupPlatform;
  /** Shows a file the app just wrote in the file manager. */
  reveal?(path: string): Promise<void>;
  /** The localhost server the browser extension delivers captures to. */
  captureStatus?(): Promise<CaptureServerStatus>;
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
