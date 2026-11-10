/**
 * The page's cloud sync, when the shell's build has a Firebase app: started
 * once with the client (startClient), read by the Settings section and the
 * data reset.
 */

import { useSyncExternalStore } from 'react';
import { getBackend, type Backend } from '../backend';
import { ENGINE_OPTIONS, SyncEngine, type SyncView } from './engine';
import type { CloudConfig, CloudStore } from './types';

export type { CloudConfig, CloudStore, CloudUser } from './types';
export type { SyncPhase, SyncView } from './engine';
export { SyncEngine } from './engine';
export { cloudErrorMessage } from './errors';

let current: SyncEngine | null = null;

/** Loads Firebase's SDK (its own chunk) and makes the store for `config`. */
export const loadFirebase = (config: CloudConfig) => () =>
  import('./firebaseStore').then(({ createFirebaseStore }) => createFirebaseStore(config));

/** Starts syncing `backend` with Firebase (or, in tests, with `load`'s store). */
export function startCloudSync(
  backend: Backend,
  config: CloudConfig,
  load: () => Promise<CloudStore> = loadFirebase(config)
): SyncEngine {
  current?.stop();
  // Google sign-in: the shell's own (desktop, Android), else a browser's popup
  const { googleSignIn } = backend.platform;
  const google = googleSignIn ? () => googleSignIn() : config.popupSignIn ? async () => null : null;
  current = new SyncEngine(backend, load, ENGINE_OPTIONS, google);
  void current.start();
  return current;
}

/** The page's sync, or null when this build has none. */
export function getCloudSync(): SyncEngine | null {
  return current;
}

/**
 * Whether this device's data syncs (Settings → Cloud sync). The web app's
 * data is the cloud's own: its account settings stand in for the section.
 */
export function syncsThisDevice(): boolean {
  return current !== null && getBackend().capabilities.dataLocation !== 'cloud';
}

/** Tests: start without sync, or with the engine given. */
export function setCloudSyncForTest(engine: SyncEngine | null): void {
  current?.stop();
  current = engine;
}

const NO_SYNC = (): (() => void) => () => {};
const NO_VIEW = (): null => null;

/** The sync's state, as it changes; null without sync. */
export function useCloudSync(): { engine: SyncEngine; view: SyncView } | null {
  const engine = current;
  const view = useSyncExternalStore(engine?.subscribe ?? NO_SYNC, engine?.getView ?? NO_VIEW);
  return engine && view ? { engine, view } : null;
}
