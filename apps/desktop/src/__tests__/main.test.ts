import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startClient } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { createTauriBackend } from '../tauriBackend';
import { desktopExtensions } from '../extensions';
import { serverMode } from '../server';

vi.mock('@taskmint/client/start', () => ({ startClient: vi.fn(async () => undefined) }));
vi.mock('../tauriBackend', () => ({ createTauriBackend: vi.fn(() => ({ name: 'tauri' })), command: vi.fn() }));
vi.mock('../extensions', () => ({ desktopExtensions: vi.fn(() => ({ name: 'desktop' })) }));
vi.mock('../server', () => ({ serverMode: { capabilities: vi.fn() } }));

const capabilities = vi.mocked(serverMode.capabilities);

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
    vi.clearAllMocks();
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
    expect(createTauriBackend).toHaveBeenCalledWith(local);
    expect(desktopExtensions).toHaveBeenCalledWith(local);
    expect(startClient).toHaveBeenCalledWith(root, {
      backend: { name: 'tauri' },
      extensions: { name: 'desktop' },
    });
  });
});
