import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { sentence, serverMode } from '../server';
import { desktopExtensions } from '../extensions';
import { UseLocalData } from '../settings/UseLocalData';
import { ServerSection } from '../settings/ServerSection';
import { UpdatesSection } from '../settings/UpdatesSection';
import { UpdatePrompt } from '../UpdatePrompt';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("server mode's shell commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue('reply');
  });

  it("go through dispatch by the Rust side's names", async () => {
    await serverMode.capabilities();
    await serverMode.connection();
    await serverMode.connect('http://localhost:8080', 'bea', 'secret');
    await serverMode.disconnect();
    await serverMode.upload();
    await expect(serverMode.restart()).resolves.toBe('reply');
    expect(mockInvoke.mock.calls).toEqual([
      ['dispatch', { command: 'get_capabilities', args: {} }],
      ['dispatch', { command: 'get_server_connection', args: {} }],
      [
        'dispatch',
        { command: 'connect_server', args: { url: 'http://localhost:8080', username: 'bea', password: 'secret' } },
      ],
      ['dispatch', { command: 'disconnect_server', args: {} }],
      ['dispatch', { command: 'upload_local_data', args: {} }],
      ['dispatch', { command: 'restart_app', args: {} }],
    ]);
  });

  it('turn a refusal into a sentence', () => {
    expect(sentence('wrong username or password')).toBe('Wrong username or password.');
    expect(sentence("Can't reach the server at x: refused!")).toBe("Can't reach the server at x: refused!");
  });
});

describe("the desktop's extensions", () => {
  it('add the Server and Updates sections and the update check, and in server mode a way back to local data', () => {
    const local = desktopExtensions({ runtime: 'desktop', dataLocation: 'local' });
    expect(local.settingsSections).toEqual([
      { id: 'server', label: 'Server', Section: ServerSection },
      { id: 'updates', label: 'Updates', Section: UpdatesSection },
    ]);
    expect(local.Background).toBe(UpdatePrompt);
    expect(local.StartupErrorActions).toBeUndefined();
    const server = desktopExtensions({ runtime: 'desktop', dataLocation: 'server' });
    expect(server.Background).toBe(UpdatePrompt);
    expect(server.StartupErrorActions).toBe(UseLocalData);
  });

  it('add nothing on a phone or tablet, which has no server mode or updater', () => {
    expect(desktopExtensions({ runtime: 'mobile', dataLocation: 'local' })).toEqual({});
  });
});
