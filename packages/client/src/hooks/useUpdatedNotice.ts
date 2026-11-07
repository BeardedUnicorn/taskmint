import { useEffect } from 'react';
import { useNotification } from '../contexts/NotificationContext';
import { readLocal, writeLocal } from '../utils/localStore';
import { APP_VERSION, compareVersions, isVersion } from '../utils/appVersion';

/** The version this browser or webview last ran. */
export const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';

/**
 * Once per new version: a toast that links to its release notes in
 * Settings → About. A version older than the last one seen (a dev build, a
 * downgrade) is noted without one.
 */
export function useUpdatedNotice(): void {
  const { notify } = useNotification();
  useEffect(() => {
    const seen = readLocal<unknown>(LAST_SEEN_VERSION_KEY, null);
    if (seen === APP_VERSION) return;
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, APP_VERSION, null);
    const updated = isVersion(seen);
    if (updated && compareVersions(APP_VERSION, seen) < 0) return;
    notify({
      title: updated ? `Updated to TaskMint ${APP_VERSION}` : `TaskMint ${APP_VERSION}`,
      message: "See what's new in this version.",
      severity: 'info',
      category: 'general',
      actions: [{ label: "What's new", view: 'settings', section: 'about' }],
      desktop: 'never',
    });
    // (Running again does nothing: the version is stored by then)
  }, [notify]);
}
