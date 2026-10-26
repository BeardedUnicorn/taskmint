/**
 * The client's Backend in the desktop app: every data command is a Tauri
 * command of the same name, events are Tauri events, and the platform is the
 * app's Rust shell (dialogs, files, OS notifications, idle time, backups).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { documentDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Backend, Platform } from "@taskmint/client/backend";

/** Paired with EXPORT_CANCELLED in crates/taskmint-core/src/contract.rs. */
export const EXPORT_CANCELLED = "Export cancelled by user";
/** Paired with IMPORT_CANCELLED in crates/taskmint-core/src/contract.rs. */
export const IMPORT_CANCELLED = "Import cancelled by user";

/** Where automatic backups go until the user picks a folder: inside Documents. */
export const DEFAULT_BACKUP_FOLDER_NAME = "TaskMint Backups";

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
    error => console.error(`Failed to listen for ${event}:`, error),
  );
  return () => {
    disposed = true;
    unlisten?.();
  };
}

const platform: Platform = {
  files: {
    async save({ contents, suggestedName, format }) {
      const saving =
        format === "csv"
          ? invoke<string>("export_csv_file", { csv: contents, suggestedFilename: suggestedName })
          : invoke<string>("export_data_to_file", { dataJson: contents, suggestedFilename: suggestedName });
      const path = await unlessCancelled(saving, EXPORT_CANCELLED);
      return path === null ? null : { kind: "path", path };
    },
    openJson: () => unlessCancelled(invoke<string>("import_data_from_file"), IMPORT_CANCELLED),
  },
  notifications: {
    show: (kind, title, body) => invoke<boolean>("show_desktop_notification", { kind, title, body }),
    setPreferences: prefs => invoke<void>("set_notification_preferences", { prefs }),
  },
  idle: {
    isSupported: () => invoke<boolean>("get_idle_support"),
    setSettings: settings => invoke<void>("set_idle_settings", { settings }),
    getPending: () => invoke("get_idle_pause"),
    resolve: choice => invoke<void>("resolve_idle_pause", { choice }),
  },
  folderBackups: {
    defaultFolder: async () => join(await documentDir(), DEFAULT_BACKUP_FOLDER_NAME),
    pickFolder: () => open({ directory: true, multiple: false, title: "Select Backup Directory" }),
    validateFolder: path => invoke("validate_backup_path", { path }),
    write: ({ folder, contents, maxBackups }) =>
      invoke("perform_automatic_backup", { backupPath: folder, currentDataJson: contents, maxBackups }),
  },
  reveal: path => revealItemInDir(path),
  captureStatus: () => invoke("get_capture_server_status"),
};

export function createTauriBackend(): Backend {
  return {
    capabilities: { runtime: "desktop", dataLocation: "local" },
    call: (command, args) => invoke(command, args),
    subscribe,
    platform,
  };
}
