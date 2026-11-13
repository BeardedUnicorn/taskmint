/**
 * Cloud sync's Firebase app for the desktop and phone apps, "TaskMint
 * desktop" (both run the same webview code), in each environment's project:
 * production's taskmint-f9a05 for a release, and dev's taskmint-dev for
 * every other build (scripts/environment.mjs). These values only name the
 * project; firebase/firestore.rules is what keeps each user's data their
 * own.
 */

import type { CloudConfig } from '@taskmint/client/start';
import type { GoogleDesktopClient } from './tauriBackend';

export const DESKTOP_FIREBASE: Record<ImportMetaEnv['TASKMINT_ENV'], CloudConfig['firebase']> = {
  production: {
    apiKey: 'AIzaSyCOyTKQkIpE8WkRx-PDqFx53ROCN_TkSz8',
    authDomain: 'taskmint-f9a05.firebaseapp.com',
    projectId: 'taskmint-f9a05',
    storageBucket: 'taskmint-f9a05.firebasestorage.app',
    messagingSenderId: '695801278605',
    appId: '1:695801278605:web:4d1a2fba9e5b026168b2c4',
    measurementId: 'G-NBZ80ZGGMB',
  },
  dev: {
    apiKey: 'AIzaSyAyB_tJga9LPTPbbuj_CMP8i0TT9enphwk',
    authDomain: 'taskmint-dev.firebaseapp.com',
    projectId: 'taskmint-dev',
    storageBucket: 'taskmint-dev.firebasestorage.app',
    messagingSenderId: '888820927672',
    appId: '1:888820927672:web:4f388531663a69a5a9b84d',
  },
};

/**
 * The "Desktop app" OAuth client for Google sign-in (Google Cloud console →
 * Credentials, project taskmint-f9a05), from the build's environment: repo
 * secrets in CI, the repo-root .env locally. The dev project safelists the
 * same client, so dev builds use it too. Without one, sign-in is email and
 * password only.
 */
export function googleDesktopClient(env: {
  VITE_GOOGLE_DESKTOP_CLIENT_ID?: string;
  VITE_GOOGLE_DESKTOP_CLIENT_SECRET?: string;
}): GoogleDesktopClient | undefined {
  const { VITE_GOOGLE_DESKTOP_CLIENT_ID: clientId, VITE_GOOGLE_DESKTOP_CLIENT_SECRET: clientSecret } = env;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/**
 * The app keeps its data in its own files, so Firestore needs no cache of
 * its own, and the webview can't open Google's sign-in popup. A development
 * build with VITE_FIREBASE_EMULATOR_HOST set (127.0.0.1, or 10.0.2.2 from
 * the Android emulator) uses the Auth and Firestore emulators instead.
 */
export function desktopCloud(env: {
  DEV: boolean;
  TASKMINT_ENV: ImportMetaEnv['TASKMINT_ENV'];
  VITE_FIREBASE_EMULATOR_HOST?: string;
}): CloudConfig {
  const emulatorHost = env.DEV ? env.VITE_FIREBASE_EMULATOR_HOST : undefined;
  return {
    firebase: DESKTOP_FIREBASE[env.TASKMINT_ENV],
    persistentCache: false,
    popupSignIn: false,
    ...(emulatorHost ? { emulatorHost } : {}),
  };
}
