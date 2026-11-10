// Desktop entry: the shared client, against the app's Tauri backend (the data
// files the Rust side keeps), syncing with Firebase once signed in.
import { startClient } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { command, createTauriBackend } from './tauriBackend';
import { desktopExtensions } from './extensions';
import { desktopCloud, googleDesktopClient } from './firebaseConfig';

async function start() {
  const capabilities = await command<Capabilities>('get_capabilities');
  await startClient(document.getElementById('root') as HTMLElement, {
    backend: createTauriBackend(capabilities, googleDesktopClient(import.meta.env)),
    extensions: desktopExtensions(capabilities),
    cloud: desktopCloud(import.meta.env),
  });
}

void start();
