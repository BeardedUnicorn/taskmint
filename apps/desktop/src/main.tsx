// Desktop entry: the shared client, against the app's Tauri backend (the data
// files, or the server the Rust side is connected to).
import { startClient } from '@taskmint/client/start';
import { createTauriBackend } from './tauriBackend';
import { desktopExtensions } from './extensions';
import { serverMode } from './server';

async function start() {
  const capabilities = await serverMode.capabilities();
  await startClient(document.getElementById('root') as HTMLElement, {
    backend: createTauriBackend(capabilities),
    extensions: desktopExtensions(capabilities),
  });
}

void start();
