/**
 * OS notifications for code that sends one directly (most code should use
 * useNotification().notify, which also decides between toast and OS). The
 * backend applies the user's notification preferences to `kind`.
 */

import { deliverDesktop } from '../notifications/desktop';
import { isWindowAttended } from '../notifications/attention';
import type { DesktopKind } from '../notifications/types';

export async function notifyDesktop(title: string, body: string, kind: DesktopKind = 'general'): Promise<void> {
  await deliverDesktop(kind, title, body);
}

/** Whether you're looking at TaskMint (in-app messages are seen; otherwise notify). */
export function isAppFocused(): boolean {
  return isWindowAttended();
}
