import type { AppExtensions } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { UpdatesSection } from './settings/UpdatesSection';
import { AboutUpdates } from './settings/AboutUpdates';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * The Tauri app's own parts of the client: the Updates section, the update
 * check, and the update status in About. A phone has them too: it downloads
 * the new version's APK instead of installing it (updates.ts).
 */
export function desktopExtensions(_capabilities: Capabilities): AppExtensions {
  return {
    settingsSections: [{ id: 'updates', label: 'Updates', Section: UpdatesSection }],
    Background: UpdatePrompt,
    AboutUpdates,
  };
}
