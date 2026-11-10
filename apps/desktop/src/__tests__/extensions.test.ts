import { describe, it, expect, vi } from 'vitest';
import { desktopExtensions } from '../extensions';
import { UpdatesSection } from '../settings/UpdatesSection';
import { UpdatePrompt } from '../UpdatePrompt';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

describe("the desktop's extensions", () => {
  it('add the Updates section and the update check', () => {
    const desktop = desktopExtensions({ runtime: 'desktop', dataLocation: 'local' });
    expect(desktop.settingsSections).toEqual([{ id: 'updates', label: 'Updates', Section: UpdatesSection }]);
    expect(desktop.Background).toBe(UpdatePrompt);
  });

  it('add nothing on a phone or tablet, which has no updater', () => {
    expect(desktopExtensions({ runtime: 'mobile', dataLocation: 'local' })).toEqual({});
  });
});
