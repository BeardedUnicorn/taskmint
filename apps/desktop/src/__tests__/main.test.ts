import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startClient } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { command, createTauriBackend } from '../tauriBackend';
import { desktopExtensions } from '../extensions';
import { desktopCloud, googleDesktopClient } from '../firebaseConfig';

vi.mock('@taskmint/client/start', () => ({ startClient: vi.fn(async () => undefined) }));
vi.mock('../tauriBackend', () => ({ createTauriBackend: vi.fn(() => ({ name: 'tauri' })), command: vi.fn() }));
vi.mock('../extensions', () => ({ desktopExtensions: vi.fn(() => ({ name: 'desktop' })) }));

const capabilities = vi.mocked(command);

/** Runs the entry once, as the app starts it. */
async function launch(reported: Capabilities) {
  capabilities.mockResolvedValue(reported);
  vi.resetModules();
  await import('../main');
  await vi.waitFor(() => expect(startClient).toHaveBeenCalled());
}

describe('the desktop entry', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('starts the client in #root on what the Rust side reports', async () => {
    const local: Capabilities = { runtime: 'desktop', dataLocation: 'local' };
    await launch(local);
    expect(command).toHaveBeenCalledWith('get_capabilities');
    expect(createTauriBackend).toHaveBeenCalledWith(local, googleDesktopClient(import.meta.env));
    expect(desktopExtensions).toHaveBeenCalledWith(local);
    expect(startClient).toHaveBeenCalledWith(root, {
      backend: { name: 'tauri' },
      extensions: { name: 'desktop' },
      cloud: desktopCloud(import.meta.env),
    });
  });
});
