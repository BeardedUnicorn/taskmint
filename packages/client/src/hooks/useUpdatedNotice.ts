import { useEffect } from 'react';
import { useNotification } from '../contexts/NotificationContext';
import { readLocal, writeLocal } from '../utils/localStore';
import { APP_VERSION, compareVersions, isVersion } from '../utils/appVersion';
import { hasUserFacingChanges, RELEASES, releasesSince } from '../utils/changelog';

/** The version this browser or webview last ran. */
export const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';

/** The version the last update came from: About shows what's new since it. */
export const UPDATED_FROM_VERSION_KEY = 'updatedFromVersion';

/**
 * The releases an update from `from` to this version brought that changed
 * something to see, newest first: none when `from` isn't an older version.
 */
export function releasesSinceUpdate(from: unknown) {
  return isVersion(from) ? releasesSince(RELEASES, from, APP_VERSION).filter(hasUserFacingChanges) : [];
}

/**
 * Once per new version: a toast that links to its release notes in
 * Settings → About, which shows every release since the version before
 * when the update skipped some. A version older than the last one seen (a
 * dev build, a downgrade) is noted without one.
 */
export function useUpdatedNotice(): void {
  const { notify } = useNotification();
  useEffect(() => {
    const seen = readLocal<unknown>(LAST_SEEN_VERSION_KEY, null);
    if (seen === APP_VERSION) return;
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, APP_VERSION, null);
    const updated = isVersion(seen);
    if (updated && compareVersions(APP_VERSION, seen) < 0) return;
    if (updated) writeLocal<unknown>(UPDATED_FROM_VERSION_KEY, seen, null);
    const several = releasesSinceUpdate(seen).length > 1;
    notify({
      title: updated ? `Updated to TaskMint ${APP_VERSION}` : `TaskMint ${APP_VERSION}`,
      message: several ? `See what's new since ${seen}.` : "See what's new in this version.",
      severity: 'info',
      category: 'general',
      actions: [{ label: "What's new", view: 'settings', section: 'about' }],
      desktop: 'never',
    });
    // (Running again does nothing: the version is stored by then)
  }, [notify]);
}
