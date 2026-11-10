/**
 * The web app's Firebase app: the "TaskMint web" app in project
 * taskmint-f9a05, served by Firebase Hosting at taskmint-f9a05.web.app.
 * These values only name the project; firebase/firestore.rules is what
 * keeps each user's data their own.
 */

import type { CloudConfig } from '@taskmint/client/start';

export const WEB_FIREBASE: CloudConfig['firebase'] = {
  apiKey: 'AIzaSyCOyTKQkIpE8WkRx-PDqFx53ROCN_TkSz8',
  authDomain: 'taskmint-f9a05.firebaseapp.com',
  projectId: 'taskmint-f9a05',
  storageBucket: 'taskmint-f9a05.firebasestorage.app',
  messagingSenderId: '695801278605',
  appId: '1:695801278605:web:b6fd0dd1b5b9590e68b2c4',
  measurementId: 'G-KRPP00PDHX',
};

/**
 * The page holds the only copy of the data besides the cloud, so Firestore
 * keeps its cache and unsent writes across reloads; Google sign-in opens in
 * a popup. A development build with VITE_FIREBASE_EMULATOR_HOST set uses
 * the Auth and Firestore emulators instead.
 */
export function webCloud(env: { DEV: boolean; VITE_FIREBASE_EMULATOR_HOST?: string }): CloudConfig {
  const emulatorHost = env.DEV ? env.VITE_FIREBASE_EMULATOR_HOST : undefined;
  return {
    firebase: WEB_FIREBASE,
    persistentCache: true,
    popupSignIn: true,
    ...(emulatorHost ? { emulatorHost } : {}),
  };
}
