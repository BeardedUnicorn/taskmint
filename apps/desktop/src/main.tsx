// Desktop entry: the shared client, against the app's Tauri backend (the data
// files, or the server the Rust side is connected to).
import { startClient } from "@taskmint/client/start";
import { createTauriBackend } from "./tauriBackend";
import { desktopExtensions } from "./extensions";
import { serverMode } from "./server";

async function start() {
  const capabilities = await serverMode.capabilities();
  await startClient(document.getElementById("root") as HTMLElement, {
    backend: createTauriBackend(capabilities),
    extensions: desktopExtensions(capabilities),
    // Only the installed app moves in an older version's records, and only
    // into its own files: a development build's webview storage isn't the
    // installed app's (see loadAppRecords), and a server's data is its own.
    importLegacyRecords: !import.meta.env.DEV && capabilities.dataLocation === "local",
  });
}

void start();
