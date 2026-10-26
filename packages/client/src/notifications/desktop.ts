/**
 * OS notifications, through the platform (the desktop app's backend applies
 * the saved preferences and plays the sound). Resolves to whether one was
 * shown, so the caller can fall back to a toast.
 */

import { getBackend } from '../backend';
import type { DesktopKind } from './types';

export async function deliverDesktop(kind: DesktopKind, title: string, body: string): Promise<boolean> {
  try {
    return (await getBackend().platform.notifications.show(kind, title, body)) === true;
  } catch (error) {
    console.error('Failed to show an OS notification:', error);
    return false;
  }
}
