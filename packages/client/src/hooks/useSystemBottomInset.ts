/**
 * A phone's navigation bar or gesture area covers the bottom of the app
 * (Android draws it edge to edge), and Android's webview doesn't say so in
 * env(safe-area-inset-bottom). This puts the system's answer in the root's
 * --system-bottom-inset, which SAFE_BOTTOM (theme/media) keeps clear of:
 * the bottom tabs, toasts and full-screen dialogs. Read again when the
 * window resizes (a turn of the phone). Nothing where there are no system
 * bars.
 */

import { useEffect } from 'react';
import { getBackend } from '../backend';

export function useSystemBottomInset(): void {
  useEffect(() => {
    const systemBars = getBackend().platform.systemBars;
    if (!systemBars) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--system-bottom-inset', `${systemBars.bottomInset()}px`);
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      root.style.removeProperty('--system-bottom-inset');
    };
  }, []);
}
