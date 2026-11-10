import type { AppExtensions } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { UpdatesSection } from './settings/UpdatesSection';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * The desktop's own parts of the client: the Updates section and the update
 * check. A phone or tablet has neither: its build has no updater.
 */
export function desktopExtensions({ runtime }: Capabilities): AppExtensions {
  if (runtime === 'mobile') return {};
  return {
    settingsSections: [{ id: 'updates', label: 'Updates', Section: UpdatesSection }],
    Background: UpdatePrompt,
  };
}
