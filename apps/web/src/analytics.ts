/**
 * Firebase Analytics in the browser: which pages are opened, and nothing
 * else (utils/analytics in the client decides when). Google's tag only
 * loads once analytics is on, so a page whose user turned it off never
 * starts it.
 */

import type { AnalyticsPlatform } from '@taskmint/client/backend';

type Sdk = typeof import('firebase/analytics');
type Started = { sdk: Sdk; analytics: ReturnType<Sdk['initializeAnalytics']> } | null;

const loadSdk = () => Promise.all([import('firebase/analytics'), import('firebase/app')]);

export function createWebAnalytics(
  load: () => Promise<[Sdk, { getApp(): never }]> = loadSdk as never
): AnalyticsPlatform {
  let ready: Promise<Started> | null = null;
  // The Firebase app is the one sync started (firebase/app's default)
  const start = () =>
    (ready ??= load().then(async ([sdk, app]) =>
      (await sdk.isSupported())
        ? { sdk, analytics: sdk.initializeAnalytics(app.getApp(), { config: { send_page_view: false } }) }
        : null
    ));
  return {
    setEnabled(enabled) {
      if (!enabled && !ready) return;
      void start().then(started => started?.sdk.setAnalyticsCollectionEnabled(started.analytics, enabled));
    },
    screen(name) {
      void ready?.then(started =>
        started?.sdk.logEvent(started.analytics, 'screen_view', {
          firebase_screen: name,
          firebase_screen_class: 'TaskMint',
        })
      );
    },
  };
}
