import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const plugin = {
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
};
vi.mock('@tauri-apps/plugin-notification', () => plugin);

let inTauri = false;
vi.mock('../tauri', () => ({ isTauriEnvironment: () => inTauri }));

// The module keeps the sender it loads, so each test imports a fresh copy
async function load() {
  vi.resetModules();
  return import('../desktopNotification');
}

describe('notifyDesktop', () => {
  const originalNotification = (globalThis as { Notification?: unknown }).Notification;

  beforeEach(() => {
    vi.clearAllMocks();
    inTauri = false;
  });

  afterEach(() => {
    (globalThis as { Notification?: unknown }).Notification = originalNotification;
  });

  it("uses the app's notifications, asking permission the first time", async () => {
    inTauri = true;
    plugin.isPermissionGranted.mockResolvedValue(false);
    plugin.requestPermission.mockResolvedValue('granted');
    const { notifyDesktop } = await load();

    await notifyDesktop('Work logs imported', '2 new');

    expect(plugin.requestPermission).toHaveBeenCalled();
    expect(plugin.sendNotification).toHaveBeenCalledWith({ title: 'Work logs imported', body: '2 new' });
  });

  it('sends nothing when permission is refused', async () => {
    inTauri = true;
    plugin.isPermissionGranted.mockResolvedValue(false);
    plugin.requestPermission.mockResolvedValue('denied');
    const { notifyDesktop } = await load();

    await notifyDesktop('t', 'b');

    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it("uses the browser's notifications outside the app", async () => {
    const shown: Array<[string, NotificationOptions | undefined]> = [];
    (globalThis as { Notification?: unknown }).Notification = class {
      static permission = 'granted';
      static requestPermission = vi.fn();
      constructor(title: string, options?: NotificationOptions) {
        shown.push([title, options]);
      }
    };
    const { notifyDesktop } = await load();

    await notifyDesktop('Goal Achieved!', 'Nice');

    expect(shown).toEqual([['Goal Achieved!', { body: 'Nice' }]]);
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });
});
