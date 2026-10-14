/**
 * OS notifications. In the app they go through the backend
 * (show_desktop_notification), which applies the saved preferences and plays
 * the sound; in a browser (the web preview) through the Notification API.
 * Resolves to whether one was shown, so the caller can fall back to a toast.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../utils/tauri';
import type { DesktopKind } from './types';

export async function deliverDesktop(kind: DesktopKind, title: string, body: string): Promise<boolean> {
  try {
    if (isTauriEnvironment()) {
      return (await invoke<boolean>('show_desktop_notification', { kind, title, body })) === true;
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission !== 'granted') return false;
      new Notification(title, { body });
      return true;
    }
  } catch (error) {
    console.error('Failed to show an OS notification:', error);
  }
  return false;
}
