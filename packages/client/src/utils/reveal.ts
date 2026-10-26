/**
 * "Show in Finder" for a file the app just wrote (an export, a backup).
 */

import { getBackend } from '../backend';
import type { NotificationAction } from '../notifications/types';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

export const REVEAL_LABEL = IS_MAC ? 'Show in Finder' : 'Show in folder';

/** A toast button that shows `path` in the file manager (none where the platform can't). */
export function revealAction(path: string | null | undefined): NotificationAction[] {
  const reveal = getBackend().platform.reveal;
  if (!path || !reveal) return [];
  return [{ label: REVEAL_LABEL, onClick: () => reveal(path) }];
}
