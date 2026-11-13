import { describe, expect, it } from 'vitest';
import { DESKTOP_FIREBASE, desktopCloud, googleDesktopClient } from '../firebaseConfig';

describe("the desktop's cloud sync", () => {
  it("is the desktop web app's in the build's project, without a cache or popups of its own", () => {
    expect(desktopCloud({ DEV: false, TASKMINT_ENV: 'production' })).toEqual({
      firebase: DESKTOP_FIREBASE.production,
      persistentCache: false,
      popupSignIn: false,
    });
    expect(desktopCloud({ DEV: false, TASKMINT_ENV: 'dev' }).firebase).toBe(DESKTOP_FIREBASE.dev);
  });

  it('keeps each environment to its own project', () => {
    expect(DESKTOP_FIREBASE.production.projectId).toBe('taskmint-f9a05');
    expect(DESKTOP_FIREBASE.dev.projectId).toBe('taskmint-dev');
    expect(DESKTOP_FIREBASE.dev.appId).toBe('1:888820927672:web:4f388531663a69a5a9b84d');
  });

  it('uses the emulators on the host a development build names, and only a development build', () => {
    expect(desktopCloud({ DEV: true, TASKMINT_ENV: 'dev', VITE_FIREBASE_EMULATOR_HOST: '10.0.2.2' }).emulatorHost).toBe(
      '10.0.2.2'
    );
    expect(desktopCloud({ DEV: true, TASKMINT_ENV: 'dev' }).emulatorHost).toBeUndefined();
    expect(
      desktopCloud({ DEV: false, TASKMINT_ENV: 'dev', VITE_FIREBASE_EMULATOR_HOST: '10.0.2.2' }).emulatorHost
    ).toBeUndefined();
  });

  it('signs in with Google only when the build names both halves of its client', () => {
    expect(
      googleDesktopClient({ VITE_GOOGLE_DESKTOP_CLIENT_ID: 'id', VITE_GOOGLE_DESKTOP_CLIENT_SECRET: 'secret' })
    ).toEqual({ clientId: 'id', clientSecret: 'secret' });
    expect(googleDesktopClient({ VITE_GOOGLE_DESKTOP_CLIENT_ID: 'id' })).toBeUndefined();
    expect(googleDesktopClient({ VITE_GOOGLE_DESKTOP_CLIENT_SECRET: 'secret' })).toBeUndefined();
  });
});
