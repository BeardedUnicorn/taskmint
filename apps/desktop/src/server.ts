/**
 * Server mode's shell commands (apps/desktop/src-tauri/src/server.rs): which
 * server this computer uses, signing in and out of it, and copying the data
 * on this computer to it. Connecting or disconnecting takes effect when the
 * app restarts. The token stays in the OS keychain, out of the webview.
 */

import type { RestoreSummary } from "@taskmint/contracts";
import type { Capabilities } from "@taskmint/client/backend";
import { command } from "./tauriBackend";

/** The link to the server, as the Rust side's event stream finds it. */
export type LinkStatus = "connecting" | "connected" | "unreachable" | "signedOut";

/** `server-connection-changed`'s payload. */
export interface Link {
  status: LinkStatus;
  /** Why it's down, in the server's or the network's words. */
  detail: string | null;
}

export interface Connection {
  url: string;
  username: string;
  /** The token's name on the server (its API tokens list shows it). */
  deviceName: string;
}

export type ServerConnection = Connection & Link;

export interface Uploaded {
  /** Records sent: tasks, notes, templates, the goal. */
  records: number;
  restored: RestoreSummary;
  /** Data on this computer that couldn't be read, so wasn't sent. */
  warnings: string[];
}

export const serverMode = {
  capabilities: () => command<Capabilities>("get_capabilities"),
  /** null: this computer's data is on this computer. */
  connection: () => command<ServerConnection | null>("get_server_connection"),
  connect: (url: string, username: string, password: string) =>
    command<Connection>("connect_server", { url, username, password }),
  disconnect: () => command<{ signedOut: boolean }>("disconnect_server"),
  upload: () => command<Uploaded>("upload_local_data"),
  restart: () => command<void>("restart_app"),
};

/** A refusal as a sentence: the server's own words start in lower case. */
export function sentence(reason: unknown): string {
  const text = String(reason);
  const capital = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}
