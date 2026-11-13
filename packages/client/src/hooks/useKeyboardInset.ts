/**
 * Where the on-screen keyboard leaves room, for dialogs to sit in. The
 * Android app draws edge to edge, so the system no longer shrinks the page
 * for the keyboard: a dialog's buttons would stay under it. The visual
 * viewport says what still shows, and the root gets it as two CSS
 * variables, `--keyboard-top` and `--keyboard-bottom` (0px with no keyboard,
 * as on a desktop), which the theme's dialogs keep clear of.
 */

import { useEffect } from 'react';

export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      // Zoomed in (a pinch), the viewport shrinks without any keyboard
      const zoomed = viewport.scale !== 1;
      const top = zoomed ? 0 : Math.max(0, Math.round(viewport.offsetTop));
      const bottom = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      root.style.setProperty('--keyboard-top', `${top}px`);
      root.style.setProperty('--keyboard-bottom', `${bottom}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty('--keyboard-top');
      root.style.removeProperty('--keyboard-bottom');
    };
  }, []);
}
