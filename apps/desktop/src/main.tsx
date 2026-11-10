// Desktop entry: the shared client, against the app's Tauri backend (the data
// files the Rust side keeps).
import { startClient } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { command, createTauriBackend } from './tauriBackend';
import { desktopExtensions } from './extensions';

async function start() {
  const capabilities = await command<Capabilities>('get_capabilities');
  await startClient(document.getElementById('root') as HTMLElement, {
    backend: createTauriBackend(capabilities),
    extensions: desktopExtensions(capabilities),
  });
}

void start();
