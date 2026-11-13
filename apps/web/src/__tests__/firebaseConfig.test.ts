import { describe, expect, it } from 'vitest';
import { WEB_FIREBASE, webCloud } from '../firebaseConfig';

describe("the web app's cloud", () => {
  it("is the web app's in the build's project, keeping its cache, with Google in a popup", () => {
    expect(webCloud({ DEV: false, TASKMINT_ENV: 'production' })).toEqual({
      firebase: WEB_FIREBASE.production,
      persistentCache: true,
      popupSignIn: true,
    });
    expect(webCloud({ DEV: false, TASKMINT_ENV: 'dev' }).firebase).toBe(WEB_FIREBASE.dev);
    expect(WEB_FIREBASE.production.appId).toBe('1:695801278605:web:b6fd0dd1b5b9590e68b2c4');
    expect(WEB_FIREBASE.dev.appId).toBe('1:888820927672:web:865a7d8ce31f9745a9b84d');
  });

  it('keeps each environment to its own project, with Analytics in production only', () => {
    expect(WEB_FIREBASE.production).toMatchObject({ projectId: 'taskmint-f9a05', measurementId: 'G-KRPP00PDHX' });
    expect(WEB_FIREBASE.dev.projectId).toBe('taskmint-dev');
    expect(WEB_FIREBASE.dev.authDomain).toBe('taskmint-dev.firebaseapp.com');
    expect(WEB_FIREBASE.dev.measurementId).toBeUndefined();
  });

  it('uses the emulators a development build names, and only a development build', () => {
    expect(webCloud({ DEV: true, TASKMINT_ENV: 'dev', VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1' }).emulatorHost).toBe(
      '127.0.0.1'
    );
    expect(webCloud({ DEV: true, TASKMINT_ENV: 'dev' }).emulatorHost).toBeUndefined();
    expect(
      webCloud({ DEV: false, TASKMINT_ENV: 'dev', VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1' }).emulatorHost
    ).toBeUndefined();
  });
});
