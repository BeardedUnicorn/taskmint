import type { AppExtensions } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { UpdatesSection } from './settings/UpdatesSection';
import { AboutUpdates } from './settings/AboutUpdates';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * The desktop's own parts of the client: the Updates section, the update
 * check, and the update status in About. A phone or tablet has none: its
 * build has no updater.
 */
export function desktopExtensions({ runtime }: Capabilities): AppExtensions {
  if (runtime === 'mobile') return {};
  return {
    settingsSections: [{ id: 'updates', label: 'Updates', Section: UpdatesSection }],
    Background: UpdatePrompt,
    AboutUpdates,
  };
}
