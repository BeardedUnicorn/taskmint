/**
 * The web app's Firebase app, "TaskMint web", in each environment's project:
 * production's taskmint-f9a05 (served at taskmint-f9a05.web.app) for a
 * release, and dev's taskmint-dev (taskmint-dev.web.app) for every other
 * build (scripts/environment.mjs). These values only name the project;
 * firebase/firestore.rules is what keeps each user's data their own. Dev
 * has no Analytics.
 */

import type { CloudConfig } from '@taskmint/client/start';

export const WEB_FIREBASE: Record<ImportMetaEnv['TASKMINT_ENV'], CloudConfig['firebase']> = {
  production: {
    apiKey: 'AIzaSyCOyTKQkIpE8WkRx-PDqFx53ROCN_TkSz8',
    authDomain: 'taskmint-f9a05.firebaseapp.com',
    projectId: 'taskmint-f9a05',
    storageBucket: 'taskmint-f9a05.firebasestorage.app',
    messagingSenderId: '695801278605',
    appId: '1:695801278605:web:b6fd0dd1b5b9590e68b2c4',
    measurementId: 'G-KRPP00PDHX',
  },
  dev: {
    apiKey: 'AIzaSyAyB_tJga9LPTPbbuj_CMP8i0TT9enphwk',
    authDomain: 'taskmint-dev.firebaseapp.com',
    projectId: 'taskmint-dev',
    storageBucket: 'taskmint-dev.firebasestorage.app',
    messagingSenderId: '888820927672',
    appId: '1:888820927672:web:865a7d8ce31f9745a9b84d',
  },
};

/**
 * The page holds the only copy of the data besides the cloud, so Firestore
 * keeps its cache and unsent writes across reloads; Google sign-in opens in
 * a popup. A development build with VITE_FIREBASE_EMULATOR_HOST set uses
 * the Auth and Firestore emulators instead.
 */
export function webCloud(env: {
  DEV: boolean;
  TASKMINT_ENV: ImportMetaEnv['TASKMINT_ENV'];
  VITE_FIREBASE_EMULATOR_HOST?: string;
}): CloudConfig {
  const emulatorHost = env.DEV ? env.VITE_FIREBASE_EMULATOR_HOST : undefined;
  return {
    firebase: WEB_FIREBASE[env.TASKMINT_ENV],
    persistentCache: true,
    popupSignIn: true,
    ...(emulatorHost ? { emulatorHost } : {}),
  };
}
