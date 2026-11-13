import { describe, it, expect, vi } from 'vitest';
import { desktopExtensions } from '../extensions';
import { UpdatesSection } from '../settings/UpdatesSection';
import { UpdatePrompt } from '../UpdatePrompt';
import { AboutUpdates } from '../settings/AboutUpdates';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

describe("the Tauri app's extensions", () => {
  it('add the Updates section, the update check and the update status in About', () => {
    const desktop = desktopExtensions({ runtime: 'desktop', dataLocation: 'local' });
    expect(desktop.settingsSections).toEqual([{ id: 'updates', label: 'Updates', Section: UpdatesSection }]);
    expect(desktop.Background).toBe(UpdatePrompt);
    expect(desktop.AboutUpdates).toBe(AboutUpdates);
  });

  it('add the same on a phone, which downloads its updates', () => {
    expect(desktopExtensions({ runtime: 'mobile', dataLocation: 'local' })).toEqual(
      desktopExtensions({ runtime: 'desktop', dataLocation: 'local' })
    );
  });
});
