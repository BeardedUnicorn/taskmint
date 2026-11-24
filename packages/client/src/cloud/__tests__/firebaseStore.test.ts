import { describe, expect, it, vi } from 'vitest';
import type { CloudConfig } from '../types';

// The SDK, as far as the store uses it: each call recorded
const sdk = vi.hoisted(() => {
  class Timestamp {
    constructor(
      readonly seconds: number,
      readonly nanoseconds: number
    ) {}
  }
  const batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) };
  return {
    Timestamp,
    batch,
    auth: {} as Record<string, unknown> & { currentUser?: unknown },
    db: {} as Record<string, unknown>,
    authListener: null as ((user: unknown) => void) | null,
  };
});

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({ name: 'app' })) }));
vi.mock('firebase/auth', () => {
  // Constructed for a popup; its credential() wraps a token
  const GoogleAuthProvider = Object.assign(
    vi.fn(function GoogleAuthProvider() {}),
    { credential: vi.fn((token: string) => ({ token })) }
  );
  return {
    initializeAuth: vi.fn(() => sdk.auth),
    indexedDBLocalPersistence: 'indexedDB',
    browserLocalPersistence: 'local',
    browserPopupRedirectResolver: 'popups',
    connectAuthEmulator: vi.fn(),
    onAuthStateChanged: vi.fn((_auth, listener) => {
      sdk.authListener = listener;
      return () => undefined;
    }),
    signInWithEmailAndPassword: vi.fn(async () => ({})),
    createUserWithEmailAndPassword: vi.fn(async () => ({})),
    sendPasswordResetEmail: vi.fn(async () => undefined),
    signInWithCredential: vi.fn(async () => ({})),
    signInWithPopup: vi.fn(async () => ({})),
    signOut: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
    GoogleAuthProvider,
  };
});
vi.mock('firebase/firestore', () => ({
  Timestamp: sdk.Timestamp,
  initializeFirestore: vi.fn(() => sdk.db),
  memoryLocalCache: vi.fn(() => 'memory'),
  persistentLocalCache: vi.fn(options => ({ persistent: options })),
  persistentMultipleTabManager: vi.fn(() => 'tabs'),
  connectFirestoreEmulator: vi.fn(),
  // A path under the database, or under a collection
  doc: vi.fn((parent: { path?: string }, ...path: string[]) => ({
    path: [parent.path, ...path].filter(Boolean).join('/'),
  })),
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((...args) => ['where', ...args]),
  orderBy: vi.fn(field => ['orderBy', field]),
  limit: vi.fn(n => ['limit', n]),
  writeBatch: vi.fn(() => sdk.batch),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
}));

const auth = await import('firebase/auth');
const fs = await import('firebase/firestore');
const { BATCH_SIZE, createFirebaseStore, cursorOf } = await import('../firebaseStore');

const CONFIG: CloudConfig = {
  firebase: {
    apiKey: 'key',
    authDomain: 'example.firebaseapp.com',
    projectId: 'example',
    storageBucket: 'example.appspot.com',
    messagingSenderId: '1',
    appId: 'app',
  },
  persistentCache: false,
  popupSignIn: false,
};

/** A snapshot document as Firestore hands it over. */
function snap(id: string, fields: Record<string, unknown>, pending = false) {
  return { id, get: (field: string) => fields[field], metadata: { hasPendingWrites: pending } };
}

describe('the Firebase store', () => {
  it('signs in with the session in IndexedDB, and no popups in a webview', async () => {
    await createFirebaseStore(CONFIG);
    expect(auth.initializeAuth).toHaveBeenCalledWith(expect.anything(), { persistence: ['indexedDB', 'local'] });
    expect(fs.memoryLocalCache).toHaveBeenCalled();
    expect(auth.connectAuthEmulator).not.toHaveBeenCalled();

    await createFirebaseStore({ ...CONFIG, persistentCache: true, popupSignIn: true, emulatorHost: '10.0.2.2' });
    expect(auth.initializeAuth).toHaveBeenLastCalledWith(expect.anything(), {
      persistence: ['indexedDB', 'local'],
      popupRedirectResolver: 'popups',
    });
    expect(fs.initializeFirestore).toHaveBeenLastCalledWith(expect.anything(), {
      localCache: { persistent: { tabManager: 'tabs' } },
    });
    expect(auth.connectAuthEmulator).toHaveBeenCalledWith(sdk.auth, 'http://10.0.2.2:9099', { disableWarnings: true });
    expect(fs.connectFirestoreEmulator).toHaveBeenCalledWith(sdk.db, '10.0.2.2', 8085);
  });

  it('reports the signed-in user, and signs in and out every way', async () => {
    const store = await createFirebaseStore(CONFIG);
    const users: unknown[] = [];
    store.onUser(user => users.push(user));
    sdk.authListener!({ uid: 'bea', email: 'bea@example.com', providerData: [{ providerId: 'password' }] });
    sdk.authListener!(null);
    expect(users).toEqual([{ uid: 'bea', email: 'bea@example.com', providers: ['password'] }, null]);

    await store.signIn('bea@example.com', 'pw');
    expect(auth.signInWithEmailAndPassword).toHaveBeenCalledWith(sdk.auth, 'bea@example.com', 'pw');
    await store.signUp('cal@example.com', 'pw2');
    expect(auth.createUserWithEmailAndPassword).toHaveBeenCalledWith(sdk.auth, 'cal@example.com', 'pw2');
    await store.resetPassword('bea@example.com');
    expect(auth.sendPasswordResetEmail).toHaveBeenCalledWith(sdk.auth, 'bea@example.com');
    await store.signInWithGoogle('id-token');
    expect(auth.signInWithCredential).toHaveBeenCalledWith(sdk.auth, { token: 'id-token' });
    await store.signInWithGoogle(null);
    expect(auth.signInWithPopup).toHaveBeenCalledWith(sdk.auth, expect.any(auth.GoogleAuthProvider));
    await store.signOut();
    expect(auth.signOut).toHaveBeenCalledWith(sdk.auth);
    expect(store.refreshToken()).toBeNull();
    sdk.auth.currentUser = { uid: 'bea', refreshToken: 'refresh' };
    expect(store.refreshToken()).toBe('refresh');
    sdk.auth.currentUser = { uid: 'bea' };
    await store.deleteUser();
    expect(auth.deleteUser).toHaveBeenCalledWith({ uid: 'bea' });
  });

  it('reads, starts and watches the account, and asks whether it has data', async () => {
    const store = await createFirebaseStore(CONFIG);
    vi.mocked(fs.getDoc).mockResolvedValueOnce({ exists: () => true, get: () => 3 } as never);
    expect(await store.account('bea')).toBe(3);
    vi.mocked(fs.getDoc).mockResolvedValueOnce({ exists: () => false, get: () => undefined } as never);
    expect(await store.account('bea')).toBeNull();
    expect(fs.doc).toHaveBeenCalledWith(sdk.db, 'users', 'bea');

    expect(await store.createAccount('bea')).toBe(1);
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'users/bea' }, { epoch: 1 });

    const epochs: unknown[] = [];
    store.watchAccount('bea', epoch => epochs.push(epoch));
    const onAccount = vi.mocked(fs.onSnapshot).mock.calls[0][1] as (snapshot: unknown) => void;
    onAccount({ metadata: { fromCache: true }, exists: () => true, get: () => 1 });
    onAccount({ metadata: { fromCache: false }, exists: () => true, get: () => 2 });
    onAccount({ metadata: { fromCache: false }, exists: () => false, get: () => undefined });
    expect(epochs).toEqual([2, null]);

    vi.mocked(fs.getDocs).mockResolvedValueOnce({ empty: false } as never);
    expect(await store.hasData('bea')).toBe(true);
    expect(fs.where).toHaveBeenCalledWith('deleted', '==', false);
    expect(fs.limit).toHaveBeenCalledWith(1);
  });

  it("listens for the server's documents after the cursor, in order", async () => {
    const store = await createFirebaseStore(CONFIG);
    const onBatch = vi.fn();
    const onError = vi.fn();
    store.listen('bea', null, onBatch, onError);
    store.listen('bea', `${'1'.padStart(12, '0')}.000000005`, onBatch, onError);
    const [[everything, , onChanges, failed], [after]] = vi.mocked(fs.onSnapshot).mock.calls as unknown as [
      [{ constraints: unknown[] }, unknown, (snapshot: unknown) => void, unknown],
      [{ constraints: unknown[] }],
    ];
    expect(everything.constraints).toEqual([['orderBy', 'updatedAt']]);
    expect(after.constraints).toEqual([
      ['where', 'updatedAt', '>', new sdk.Timestamp(1, 5)],
      ['orderBy', 'updatedAt'],
    ]);
    expect(failed).toBe(onError);
    expect(vi.mocked(fs.onSnapshot).mock.calls[0][1]).toEqual({ includeMetadataChanges: true });

    const confirmed = snap('session~a', {
      json: '{"a":1}',
      schema: 1,
      deleted: false,
      updatedAt: new sdk.Timestamp(7, 3),
    });
    const deleted = snap('session~b', { json: null, schema: 1, deleted: true, updatedAt: new sdk.Timestamp(8, 0) });
    const pending = snap('session~c', { json: '{}', schema: 1, deleted: false }, true);
    onChanges({
      metadata: { fromCache: false },
      docs: [confirmed, deleted, pending],
      docChanges: () => [
        { type: 'added', doc: confirmed },
        { type: 'modified', doc: deleted },
        { type: 'added', doc: pending },
        { type: 'removed', doc: snap('session~d', {}) },
      ],
    });
    expect(onBatch).toHaveBeenLastCalledWith({
      docs: [
        { docId: 'session~a', json: '{"a":1}', schema: 1 },
        { docId: 'session~b', json: null, schema: 1 },
      ],
      cursor: cursorOf(new sdk.Timestamp(8, 0) as never),
    });
    expect(cursorOf(new sdk.Timestamp(8, 0) as never)).toBe('000000000008.000000000');

    // From the cache: no cursor yet. Nothing at all: no batch
    onChanges({
      metadata: { fromCache: true },
      docs: [confirmed],
      docChanges: () => [{ type: 'added', doc: confirmed }],
    });
    expect(onBatch).toHaveBeenLastCalledWith({
      docs: [{ docId: 'session~a', json: '{"a":1}', schema: 1 }],
      cursor: null,
    });
    onBatch.mockClear();
    onChanges({ metadata: { fromCache: false }, docs: [], docChanges: () => [] });
    onChanges({ metadata: { fromCache: true }, docs: [], docChanges: () => [] });
    expect(onBatch).not.toHaveBeenCalled();
  });

  it("passes on the server's first answer even with nothing in it", async () => {
    const store = await createFirebaseStore(CONFIG);
    const onFirst = vi.fn();
    store.listen('cal', null, onFirst, vi.fn());
    const onNothing = vi.mocked(fs.onSnapshot).mock.calls.at(-1)![2] as unknown as (snapshot: unknown) => void;
    onNothing({ metadata: { fromCache: true }, docs: [], docChanges: () => [] });
    onNothing({ metadata: { fromCache: false }, docs: [], docChanges: () => [] });
    onNothing({ metadata: { fromCache: false }, docs: [], docChanges: () => [] });
    expect(onFirst.mock.calls).toEqual([[{ docs: [], cursor: null }]]);
  });

  /** The cloud's copies by path (none: not there), read by a transaction that records what it sets. */
  function transacting(cloud: Record<string, Record<string, unknown>> = {}) {
    const transaction = {
      get: vi.fn(async (ref: { path: string }) => {
        const fields = cloud[ref.path];
        return {
          id: ref.path.split('/').at(-1),
          exists: () => fields !== undefined,
          get: (field: string) => fields?.[field],
        };
      }),
      set: vi.fn(),
    };
    vi.mocked(fs.runTransaction).mockImplementation(async (_db, update) => update(transaction as never));
    return transaction;
  }

  it('writes documents in batches Firestore takes, with what the rules ask for', async () => {
    const store = await createFirebaseStore(CONFIG);
    const transaction = transacting();
    const docs = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => ({
      docId: `session~${i}`,
      kind: 'session',
      id: String(i),
      json: i === 0 ? null : '{}',
      hash: i === 0 ? '' : 'h',
      expects: [],
    }));
    expect(await store.write('bea', docs, { deviceId: 'desk', epoch: 2, schema: 1 })).toEqual([]);
    expect(fs.runTransaction).toHaveBeenCalledTimes(2);
    expect(transaction.set).toHaveBeenCalledTimes(BATCH_SIZE + 1);
    expect(transaction.set.mock.calls[0]).toEqual([
      { path: 'users/bea/data/session~0' },
      {
        kind: 'session',
        id: '0',
        json: null,
        hash: '',
        deleted: true,
        deviceId: 'desk',
        schema: 1,
        epoch: 2,
        updatedAt: 'SERVER_TIME',
      },
    ]);
    expect(transaction.set.mock.calls[1][1]).toMatchObject({ json: '{}', deleted: false });
    expect(sdk.batch.commit).not.toHaveBeenCalled();
  });

  it('only writes over a copy the document expects, and hands back the ones it doesn’t', async () => {
    const store = await createFirebaseStore(CONFIG);
    const transaction = transacting({
      'users/bea/data/session~seen': { hash: 'agreed', json: '{"old":1}', schema: 1, deleted: false },
      'users/bea/data/session~mine': { hash: 'sent', json: '{"mine":1}', schema: 1, deleted: false },
      'users/bea/data/session~gone': { hash: '', json: null, schema: 1, deleted: true },
      'users/bea/data/session~unseen': { hash: 'theirs', json: '{"theirs":1}', schema: 1, deleted: false },
      'users/bea/data/session~theirs-gone': { hash: '', json: null, schema: 2, deleted: true },
      'users/bea/data/session~met': { hash: 'theirs', json: '{}', schema: 1, deleted: false },
    });
    const doc = (id: string, expects: string[]) => ({
      docId: `session~${id}`,
      kind: 'session',
      id,
      json: '{"new":1}',
      hash: 'new',
      expects,
    });
    const refused = await store.write(
      'bea',
      [
        doc('seen', ['agreed', 'new']),
        doc('mine', ['agreed', 'sent', 'new']),
        doc('gone', ['', 'new']),
        doc('unseen', ['agreed', 'new']),
        doc('theirs-gone', ['agreed', 'new']),
        // New here, already in the cloud from another device
        doc('met', ['new']),
        doc('fresh', ['new']),
      ],
      { deviceId: 'desk', epoch: 2, schema: 1 }
    );
    expect(refused).toEqual([
      { docId: 'session~unseen', json: '{"theirs":1}', schema: 1 },
      { docId: 'session~theirs-gone', json: null, schema: 2 },
      { docId: 'session~met', json: '{}', schema: 1 },
    ]);
    expect(transaction.set.mock.calls.map(([ref]) => ref.path)).toEqual([
      'users/bea/data/session~seen',
      'users/bea/data/session~mine',
      'users/bea/data/session~gone',
      'users/bea/data/session~fresh',
    ]);
  });

  it('leaves writes waiting in the cache offline where the page holds the only copy, and fails elsewhere', async () => {
    const docs = [{ docId: 'session~a', kind: 'session', id: 'a', json: '{}', hash: 'h', expects: [] }];
    const meta = { deviceId: 'web', epoch: 1, schema: 1 };
    const offline = { code: 'unavailable' };
    vi.mocked(fs.runTransaction).mockRejectedValue(offline);

    const app = await createFirebaseStore(CONFIG);
    await expect(app.write('bea', docs, meta)).rejects.toBe(offline);
    expect(sdk.batch.set).not.toHaveBeenCalled();

    const web = await createFirebaseStore({ ...CONFIG, persistentCache: true });
    expect(await web.write('bea', docs, meta)).toEqual([]);
    expect(sdk.batch.set).toHaveBeenCalledWith(
      { path: 'users/bea/data/session~a' },
      expect.objectContaining({ json: '{}', hash: 'h', deviceId: 'web', updatedAt: 'SERVER_TIME' })
    );
    expect(sdk.batch.commit).toHaveBeenCalledTimes(1);

    // Anything else is a failure there too
    vi.mocked(fs.runTransaction).mockRejectedValue(new Error('quota'));
    await expect(web.write('bea', docs, meta)).rejects.toThrow('quota');
    vi.mocked(fs.runTransaction).mockRejectedValue(null);
    await expect(web.write('bea', docs, meta)).rejects.toBeNull();
    expect(sdk.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('deletes everything on a new epoch, the published documents too', async () => {
    const store = await createFirebaseStore(CONFIG);
    const all = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => ({ ref: `ref${i}` }));
    vi.mocked(fs.getDocs)
      .mockResolvedValueOnce({ docs: all } as never)
      .mockResolvedValueOnce({ docs: [{ ref: 'forecast' }] } as never)
      .mockResolvedValueOnce({ docs: [{ ref: 'phone' }] } as never);
    expect(await store.deleteAll('bea', 4)).toBe(5);
    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'users/bea' }, { epoch: 5 });
    expect(fs.getDocs).toHaveBeenCalledWith({ path: 'users/bea/published' });
    expect(fs.getDocs).toHaveBeenCalledWith({ path: 'users/bea/devices' });
    expect(sdk.batch.delete).toHaveBeenCalledTimes(BATCH_SIZE + 3);
    expect(sdk.batch.delete).toHaveBeenLastCalledWith('phone');
    expect(sdk.batch.commit).toHaveBeenCalledTimes(2);
  });

  it('publishes a document unless the cloud has it already, or a newer one', async () => {
    const store = await createFirebaseStore(CONFIG);
    const transaction = { get: vi.fn(), set: vi.fn() };
    vi.mocked(fs.runTransaction).mockImplementation(async (_db, update) => update(transaction as never));
    const doc = { json: '{"schema":1}', hash: 'abc', schema: 1, appVersion: '4.2.0' };
    const meta = { deviceId: 'desk', epoch: 2 };
    const current = (fields: Record<string, unknown> | null) =>
      transaction.get.mockResolvedValueOnce({ exists: () => fields !== null, get: (field: string) => fields?.[field] });

    current(null);
    expect(await store.publish('bea', 'payoutForecast', doc, meta)).toBe(true);
    expect(transaction.get).toHaveBeenCalledWith({ path: 'users/bea/published/payoutForecast' });
    expect(transaction.set).toHaveBeenCalledWith(
      { path: 'users/bea/published/payoutForecast' },
      {
        schema: 1,
        json: '{"schema":1}',
        hash: 'abc',
        deviceId: 'desk',
        appVersion: '4.2.0',
        epoch: 2,
        updatedAt: 'SERVER_TIME',
      }
    );

    current({ hash: 'abc', schema: 1 });
    expect(await store.publish('bea', 'payoutForecast', doc, meta)).toBe(false);
    current({ hash: 'old', schema: 2 });
    expect(await store.publish('bea', 'payoutForecast', doc, meta)).toBe(false);
    current({ hash: 'old', schema: 1 });
    expect(await store.publish('bea', 'payoutForecast', doc, meta)).toBe(true);
    expect(transaction.set).toHaveBeenCalledTimes(2);
  });
});
