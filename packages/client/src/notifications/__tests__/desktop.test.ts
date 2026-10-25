import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { deliverDesktop } from '../desktop';

let inTauri = false;
vi.mock('../../utils/tauri', () => ({ isTauriEnvironment: () => inTauri }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

describe('deliverDesktop', () => {
  const originalNotification = (globalThis as { Notification?: unknown }).Notification;

  beforeEach(() => {
    vi.clearAllMocks();
    inTauri = false;
  });

  afterEach(() => {
    (globalThis as { Notification?: unknown }).Notification = originalNotification;
  });

  it('goes through the backend in the app, which reports whether it showed', async () => {
    inTauri = true;
    mockInvoke.mockResolvedValue(true);

    await expect(deliverDesktop('backupFailure', 'Backup failed', 'Disk full')).resolves.toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('show_desktop_notification', {
      kind: 'backupFailure',
      title: 'Backup failed',
      body: 'Disk full',
    });
  });

  it('is false when the backend declines (the category is off)', async () => {
    inTauri = true;
    mockInvoke.mockResolvedValue(false);
    await expect(deliverDesktop('goalMilestone', 't', 'b')).resolves.toBe(false);
  });

  it('is false, not an error, when the backend call fails', async () => {
    inTauri = true;
    mockInvoke.mockRejectedValue('no such command');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(deliverDesktop('general', 't', 'b')).resolves.toBe(false);
  });

  it("uses the browser's notifications outside the app, asking permission first", async () => {
    const created: unknown[] = [];
    const BrowserNotification = Object.assign(
      function (this: unknown, title: string, options: unknown) {
        created.push({ title, options });
      },
      { permission: 'default', requestPermission: vi.fn() }
    );
    BrowserNotification.requestPermission.mockImplementation(async () => {
      BrowserNotification.permission = 'granted';
      return 'granted';
    });
    (globalThis as { Notification?: unknown }).Notification = BrowserNotification;

    await expect(deliverDesktop('test', 'Hello', 'World')).resolves.toBe(true);
    expect(created).toEqual([{ title: 'Hello', options: { body: 'World' } }]);
  });

  it('is false without the API or permission', async () => {
    (globalThis as { Notification?: unknown }).Notification = Object.assign(function () {}, {
      permission: 'denied',
      requestPermission: vi.fn(),
    });
    await expect(deliverDesktop('test', 't', 'b')).resolves.toBe(false);
  });
});
