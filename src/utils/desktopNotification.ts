/**
 * Desktop (OS) notifications, for things worth knowing while the window is
 * hidden or behind another app: goal milestones, browser captures. Uses the
 * Tauri notification plugin in the app and the browser's Notification API
 * otherwise; asks for permission the first time; does nothing when neither
 * is available or permission is refused.
 */

import { isTauriEnvironment } from './tauri';

type Send = (title: string, body: string) => Promise<void>;

let sendPromise: Promise<Send | null> | null = null;

async function loadSend(): Promise<Send | null> {
  // isTauriEnvironment() also accepts __TAURI_INTERNALS__ — window.__TAURI__
  // alone is only defined with app.withGlobalTauri, which this app doesn't set.
  if (isTauriEnvironment()) {
    try {
      const { sendNotification, isPermissionGranted, requestPermission } = await import(
        '@tauri-apps/plugin-notification'
      );
      return async (title, body) => {
        const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
        if (granted) sendNotification({ title, body });
      };
    } catch (error) {
      console.warn('Failed to load Tauri notification plugin:', error);
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return async (title, body) => {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'granted') new Notification(title, { body });
    };
  }
  return null;
}

export async function notifyDesktop(title: string, body: string): Promise<void> {
  sendPromise ??= loadSend();
  try {
    const send = await sendPromise;
    await send?.(title, body);
  } catch (error) {
    console.error('Failed to send desktop notification:', error);
  }
}

/** Whether the app window has focus (in-app messages are seen; otherwise notify). */
export function isAppFocused(): boolean {
  return typeof document !== 'undefined' && document.hasFocus();
}
