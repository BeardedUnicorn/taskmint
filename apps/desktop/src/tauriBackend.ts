/**
 * The client's Backend in the desktop app. Every call goes through the app's
 * one IPC command, `dispatch` (apps/desktop/src-tauri/src/dispatch.rs): data
 * commands by their own names, and the platform (dialogs, files, OS
 * notifications, idle time, backups) as the Rust shell's commands. Events are
 * Tauri events.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Backend, Platform } from "@taskmint/client/backend";

/** Paired with EXPORT_CANCELLED in crates/taskmint-core/src/contract.rs. */
export const EXPORT_CANCELLED = "Export cancelled by user";
/** Paired with IMPORT_CANCELLED in crates/taskmint-core/src/contract.rs. */
export const IMPORT_CANCELLED = "Import cancelled by user";

/** Runs a command in the app's Rust side. */
function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>("dispatch", { command: name, args });
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
          ? command<string>("export_csv_file", { csv: contents, suggestedFilename: suggestedName })
          : command<string>("export_data_to_file", { dataJson: contents, suggestedFilename: suggestedName });
      const path = await unlessCancelled(saving, EXPORT_CANCELLED);
      return path === null ? null : { kind: "path", path };
    },
    openJson: () => unlessCancelled(command<string>("import_data_from_file"), IMPORT_CANCELLED),
  },
  notifications: {
    show: (kind, title, body) => command<boolean>("show_desktop_notification", { kind, title, body }),
    setPreferences: prefs => command<void>("set_notification_preferences", { prefs }),
  },
  idle: {
    isSupported: () => command<boolean>("get_idle_support"),
    setSettings: settings => command<void>("set_idle_settings", { settings }),
    getPending: () => command("get_idle_pause"),
    resolve: choice => command<void>("resolve_idle_pause", { choice }),
  },
  folderBackups: {
    defaultFolder: () => command<string>("default_backup_dir"),
    pickFolder: () => command<string | null>("pick_backup_dir"),
    validateFolder: path => command("validate_backup_path", { path }),
    write: ({ folder, contents, maxBackups }) =>
      command("perform_automatic_backup", { backupPath: folder, currentDataJson: contents, maxBackups }),
  },
  reveal: path => command<void>("reveal_path", { path }),
  captureStatus: () => command("get_capture_server_status"),
};

export function createTauriBackend(): Backend {
  return {
    capabilities: { runtime: "desktop", dataLocation: "local" },
    call: (name, args) => command(name, args),
    subscribe,
    platform,
  };
}
