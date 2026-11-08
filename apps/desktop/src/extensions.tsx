import type { AppExtensions } from '@taskmint/client/start';
import type { Capabilities } from '@taskmint/client/backend';
import { ServerSection } from './settings/ServerSection';
import { UpdatesSection } from './settings/UpdatesSection';
import { UseLocalData } from './settings/UseLocalData';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * The desktop's own parts of the client: the Server and Updates sections,
 * the update check, and in server mode a way back to local data.
 */
export function desktopExtensions({ dataLocation }: Capabilities): AppExtensions {
  return {
    settingsSections: [
      { id: 'server', label: 'Server', Section: ServerSection },
      { id: 'updates', label: 'Updates', Section: UpdatesSection },
    ],
    Background: UpdatePrompt,
    ...(dataLocation === 'server' ? { StartupErrorActions: UseLocalData } : {}),
  };
}
