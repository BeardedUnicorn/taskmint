/**
 * "Show in Finder" for a file the app just wrote (an export, a backup).
 */

import type { NotificationAction } from '../notifications/types';
import { isTauriEnvironment } from './tauri';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

export const REVEAL_LABEL = IS_MAC ? 'Show in Finder' : 'Show in folder';

export async function revealInFolder(path: string): Promise<void> {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}

/** A toast button that shows `path` in the file manager (none outside the app). */
export function revealAction(path: string | null | undefined): NotificationAction[] {
  if (!path || !isTauriEnvironment()) return [];
  return [{ label: REVEAL_LABEL, onClick: () => revealInFolder(path) }];
}
