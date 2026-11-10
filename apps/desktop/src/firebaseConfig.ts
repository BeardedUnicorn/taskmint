/**
 * Cloud sync's Firebase app for the desktop and phone apps: the "TaskMint
 * desktop" web app in project taskmint-f9a05 (both run the same webview
 * code). These values only name the project; firebase/firestore.rules is
 * what keeps each user's data their own.
 */

import type { CloudConfig } from '@taskmint/client/start';

export const DESKTOP_FIREBASE: CloudConfig['firebase'] = {
  apiKey: 'AIzaSyCOyTKQkIpE8WkRx-PDqFx53ROCN_TkSz8',
  authDomain: 'taskmint-f9a05.firebaseapp.com',
  projectId: 'taskmint-f9a05',
  storageBucket: 'taskmint-f9a05.firebasestorage.app',
  messagingSenderId: '695801278605',
  appId: '1:695801278605:web:4d1a2fba9e5b026168b2c4',
  measurementId: 'G-NBZ80ZGGMB',
};

/**
 * The app keeps its data in its own files, so Firestore needs no cache of
 * its own, and the webview can't open Google's sign-in popup. A development
 * build with VITE_FIREBASE_EMULATOR_HOST set (127.0.0.1, or 10.0.2.2 from
 * the Android emulator) uses the Auth and Firestore emulators instead.
 */
export function desktopCloud(env: { DEV: boolean; VITE_FIREBASE_EMULATOR_HOST?: string }): CloudConfig {
  const emulatorHost = env.DEV ? env.VITE_FIREBASE_EMULATOR_HOST : undefined;
  return {
    firebase: DESKTOP_FIREBASE,
    persistentCache: false,
    popupSignIn: false,
    ...(emulatorHost ? { emulatorHost } : {}),
  };
}
