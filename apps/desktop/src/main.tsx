// Desktop entry: the shared client, against the app's Tauri backend.
import { startClient } from "@taskmint/client/start";
import { createTauriBackend } from "./tauriBackend";

void startClient(document.getElementById("root") as HTMLElement, {
  backend: createTauriBackend(),
  extensions: {},
  // Only the installed app moves in an older version's records: a development
  // build's webview storage isn't the installed app's (see loadAppRecords).
  importLegacyRecords: !import.meta.env.DEV,
});
