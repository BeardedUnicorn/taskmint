/**
 * App-wide keyboard shortcuts (⌘ on macOS, Ctrl elsewhere):
 *
 * - ⌘1–⌘8: the pages, in sidebar order
 * - ⌘N: a new task
 * - ⇧⌘N: start work (the start dialog)
 * - ⇧⌘P: pause the live timer, or resume it
 * - ⌘,: Settings
 * - ⌘K: the command palette (open or close)
 *
 * They wait while a dialog or menu is open, so they never act behind one;
 * ⌘K still closes the palette itself. In a browser, ⌘N, ⇧⌘N, ⇧⌘P and ⌘,
 * are the browser's own (new windows, printing, its settings), so the web
 * app leaves them out; the palette still offers them. The desktop's menu
 * bar shows the same shortcuts: the app takes each key first, so the menu
 * acts only when the app didn't (see app_menu/model.rs).
 */

import { useEffect, useRef } from 'react';
import { VIEWS, SidebarView } from '../navigation/views';
import { useNavigation } from '../contexts/NavigationContext';
import { getBackend } from '../backend';

export type ShortcutAction =
  | { type: 'view'; view: SidebarView }
  | { type: 'new-task' }
  | { type: 'start-work' }
  | { type: 'pause-resume' }
  | { type: 'settings' }
  | { type: 'palette' };

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/** "⌘" on macOS, "Ctrl+" elsewhere: shortcut hints read "⌘1" / "Ctrl+1". */
export function modifierLabel(mac = isMacPlatform()): string {
  return mac ? '⌘' : 'Ctrl+';
}

/** The same with Shift: "⇧⌘N" / "Ctrl+Shift+N". */
export function shiftModifierLabel(mac = isMacPlatform()): string {
  return mac ? '⇧⌘' : 'Ctrl+Shift+';
}

/** The shortcut hint for a page ("⌘1"). */
export function viewShortcut(view: SidebarView, mac = isMacPlatform()): string {
  return `${modifierLabel(mac)}${VIEWS.indexOf(view) + 1}`;
}

/** Whether the browser keeps ⌘N and ⌘, for itself (the web app). */
export function browserTakesShortcuts(): boolean {
  return getBackend().capabilities.runtime === 'web';
}

type KeyPress = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing'>;

/** What a key press asks for, if it's one of the shortcuts. */
export function shortcutFor(event: KeyPress, mac: boolean, inBrowser = false): ShortcutAction | null {
  if (event.repeat || event.isComposing || event.altKey) return null;
  const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier) return null;

  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (inBrowser) return null;
    if (key === 'n') return { type: 'start-work' };
    if (key === 'p') return { type: 'pause-resume' };
    return null;
  }
  const page = Number(key);
  if (Number.isInteger(page) && page >= 1 && page <= VIEWS.length) return { type: 'view', view: VIEWS[page - 1] };
  if (key === 'n' && !inBrowser) return { type: 'new-task' };
  if (key === ',' && !inBrowser) return { type: 'settings' };
  if (key === 'k') return { type: 'palette' };
  return null;
}

/** The command palette's root carries this, so it doesn't count as "another" modal. */
export const PALETTE_ATTRIBUTE = 'data-command-palette';

/**
 * A dialog, menu or popover (other than the palette) is open. One kept
 * mounted while closed (a phone's swipe-open menu) is hidden, and doesn't
 * count: it would hold off every shortcut and launch for good.
 */
export function otherModalOpen(): boolean {
  return document.querySelector(`.MuiModal-root:not(.MuiModal-hidden):not([${PALETTE_ATTRIBUTE}])`) !== null;
}

export function useKeyboardShortcuts({
  paletteOpen,
  onTogglePalette,
  onStartWork,
  onPauseResume,
}: {
  paletteOpen: boolean;
  onTogglePalette: () => void;
  onStartWork: () => void;
  /** Pauses the live timer, or resumes it. */
  onPauseResume: () => void;
}): void {
  const { navigate } = useNavigation();
  const latestRef = useRef({ paletteOpen, onTogglePalette, onStartWork, onPauseResume, navigate });
  useEffect(() => {
    latestRef.current = { paletteOpen, onTogglePalette, onStartWork, onPauseResume, navigate };
  });

  useEffect(() => {
    const mac = isMacPlatform();
    const inBrowser = browserTakesShortcuts();
    const onKeyDown = (event: KeyboardEvent) => {
      const action = shortcutFor(event, mac, inBrowser);
      if (!action) return;
      const { paletteOpen, onTogglePalette, onStartWork, onPauseResume, navigate } = latestRef.current;

      if (action.type === 'palette' && paletteOpen) {
        event.preventDefault();
        onTogglePalette();
        return;
      }
      if (paletteOpen || otherModalOpen()) return;

      event.preventDefault();
      switch (action.type) {
        case 'palette':
          onTogglePalette();
          break;
        case 'view':
          navigate(action.view);
          break;
        case 'new-task':
          navigate('tasks', { intent: 'new-task' });
          break;
        case 'start-work':
          onStartWork();
          break;
        case 'pause-resume':
          onPauseResume();
          break;
        case 'settings':
          navigate('settings');
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
