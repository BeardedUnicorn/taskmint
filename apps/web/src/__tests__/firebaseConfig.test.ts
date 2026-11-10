import { describe, expect, it } from 'vitest';
import { WEB_FIREBASE, webCloud } from '../firebaseConfig';

describe("the web app's cloud", () => {
  it("is the web app's, keeping its cache, with Google in a popup", () => {
    expect(webCloud({ DEV: false })).toEqual({ firebase: WEB_FIREBASE, persistentCache: true, popupSignIn: true });
    expect(WEB_FIREBASE.appId).toBe('1:695801278605:web:b6fd0dd1b5b9590e68b2c4');
  });

  it('uses the emulators a development build names, and only a development build', () => {
    expect(webCloud({ DEV: true, VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1' }).emulatorHost).toBe('127.0.0.1');
    expect(webCloud({ DEV: true }).emulatorHost).toBeUndefined();
    expect(webCloud({ DEV: false, VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1' }).emulatorHost).toBeUndefined();
  });
});
