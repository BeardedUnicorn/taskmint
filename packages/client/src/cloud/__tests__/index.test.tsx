import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { cloudErrorMessage } from '../errors';
import { getCloudSync, setCloudSyncForTest, startCloudSync, syncsThisDevice, useCloudSync } from '..';
import { asBackend, bea, createFakeBackend, createFakeCloudStore, installFakeBackendForTest } from '../../testing';
import type { CloudConfig } from '../types';

// The real SDK can’t run in jsdom: the default load gets a fake store
const firebase = vi.hoisted(() => ({ createFirebaseStore: vi.fn() }));
vi.mock('../firebaseStore', () => firebase);

const CONFIG = { persistentCache: false, popupSignIn: false } as CloudConfig;

afterEach(() => setCloudSyncForTest(null));
beforeEach(() => firebase.createFirebaseStore.mockImplementation(async () => createFakeCloudStore()));

describe('the page’s cloud sync', () => {
  it('is none until started, and one at a time after', async () => {
    expect(getCloudSync()).toBeNull();
    expect(renderHook(() => useCloudSync()).result.current).toBeNull();

    const store = createFakeCloudStore();
    const backend = createFakeBackend();
    const first = startCloudSync(asBackend(backend), CONFIG, async () => store);
    const second = startCloudSync(asBackend(backend), CONFIG, async () => store);
    expect(getCloudSync()).toBe(second);
    expect(first).not.toBe(second);

    const { result } = renderHook(() => useCloudSync());
    await vi.waitFor(() => expect(result.current?.view.phase).toBe('signedOut'));
    expect(result.current?.engine).toBe(second);
    backend.call.mockResolvedValue({
      account: { uid: 'bea', epoch: 1 },
      deviceId: 'desk',
      cursor: null,
      pending: 0,
      held: 0,
      hasData: false,
    });
    act(() => store.setUser(bea()));
    await vi.waitFor(() => expect(result.current?.view.user).toEqual(bea()));
  });

  it("signs in with Google the shell's way, else in a popup where the build has one", async () => {
    const store = createFakeCloudStore();
    const shell = createFakeBackend();
    const native = startCloudSync(asBackend(shell), CONFIG, async () => store);
    await vi.waitFor(() => expect(native.getView().phase).toBe('signedOut'));
    await native.signInWithGoogle('light');
    expect(shell.platform.googleSignIn).toHaveBeenCalledWith('light');
    expect(store.signInWithGoogle).toHaveBeenLastCalledWith('google-id-token');

    const browser = createFakeBackend({ without: ['googleSignIn'] });
    const popup = startCloudSync(asBackend(browser), { ...CONFIG, popupSignIn: true }, async () => store);
    await vi.waitFor(() => expect(popup.getView().phase).not.toBe('loading'));
    await popup.signInWithGoogle('dark');
    expect(store.signInWithGoogle).toHaveBeenLastCalledWith(null);

    expect(startCloudSync(asBackend(browser), CONFIG, async () => store).canUseGoogle).toBe(false);
  });

  it('loads Firebase itself by default', async () => {
    const engine = startCloudSync(asBackend(createFakeBackend()), CONFIG);
    await vi.waitFor(() => expect(engine.getView().phase).toBe('signedOut'));
    expect(firebase.createFirebaseStore).toHaveBeenCalledWith(CONFIG);
  });
});

describe('whether this device syncs', () => {
  it("is so where the build syncs, unless the data is the cloud's own (the web app)", () => {
    expect(syncsThisDevice()).toBe(false);
    const backend = installFakeBackendForTest({});
    startCloudSync(asBackend(backend), CONFIG, async () => createFakeCloudStore());
    expect(syncsThisDevice()).toBe(true);
    installFakeBackendForTest({ capabilities: { runtime: 'web', dataLocation: 'cloud' } });
    expect(syncsThisDevice()).toBe(false);
  });
});

describe('Firebase’s errors', () => {
  it('are put in the user’s words where they name a code, and passed on where they don’t', () => {
    expect(cloudErrorMessage({ code: 'auth/weak-password' })).toBe('Choose a password of at least 6 characters.');
    expect(cloudErrorMessage(Object.assign(new Error('Firebase: Error (auth/odd).'), { code: 'auth/odd' }))).toBe(
      'Firebase: Error (auth/odd).'
    );
    expect(cloudErrorMessage('refused')).toBe('refused');
    expect(cloudErrorMessage(null)).toBe('null');
  });
});
