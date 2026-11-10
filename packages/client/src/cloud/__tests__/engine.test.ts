import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, SYNC_SCHEMA, type OutgoingDoc } from '@taskmint/contracts';
import { SyncEngine } from '../engine';
import { asBackend, bea, createFakeCloudStore, type FakeCloudStore } from '../../testing';
import { syncHost } from './syncHost';

const doc = (id: string, hash = 'h1'): OutgoingDoc => ({
  docId: `session~${id}`,
  kind: 'session',
  id,
  json: '{}',
  hash,
});

const OPTIONS = { sendDelayMs: 5, retryMs: 20 };

let store: FakeCloudStore;

beforeEach(() => {
  store = createFakeCloudStore();
});

async function started(host: ReturnType<typeof syncHost>, load = async () => store) {
  const engine = new SyncEngine(asBackend(host.backend), load, OPTIONS);
  await engine.start();
  return engine;
}

const phaseOf = (engine: SyncEngine) => engine.getView().phase;

describe('cloud sync, signing in', () => {
  it('waits signed out, and passes signing in, up and out to Firebase', async () => {
    const engine = await started(syncHost());
    expect(engine.getView()).toEqual({ phase: 'signedOut', user: null, pending: 0, held: 0, error: null });
    await engine.resetPassword('bea@example.com');
    expect(store.resetPassword).toHaveBeenCalledWith('bea@example.com');
    await engine.signUp('cal@example.com', 'pw');
    expect(store.signUp).toHaveBeenCalledWith('cal@example.com', 'pw');
    await engine.signOut();
    expect(engine.canUseGoogle).toBe(false);
    const withGoogle = new SyncEngine(
      asBackend(syncHost().backend),
      async () => store,
      OPTIONS,
      async () => 'token'
    );
    await withGoogle.start();
    expect(withGoogle.canUseGoogle).toBe(true);
    await withGoogle.signInWithGoogle();
    expect(store.signInWithGoogle).toHaveBeenCalledWith('token');
    withGoogle.stop();
    await engine.signOut();
    await engine.signIn('bea@example.com', 'pw');
    expect(store.signIn).toHaveBeenCalledWith('bea@example.com', 'pw');
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
  });

  it('says so when the SDK can’t load, and signs out without it', async () => {
    const host = syncHost();
    const engine = new SyncEngine(asBackend(host.backend), () => Promise.reject(new Error('offline')));
    expect(phaseOf(engine)).toBe('loading');
    await engine.signOut();
    await engine.start();
    expect(engine.getView()).toMatchObject({ phase: 'error', error: 'offline' });
    engine.stop();
    expect(host.backend.listenerCount(EVENTS.SYNC_PENDING)).toBe(0);
  });

  it('starts the account on its first epoch and sends what this device has', async () => {
    const host = syncHost({ outgoing: [doc('s1')] });
    const engine = await started(host);
    store.setUser(bea());
    await vi.waitFor(() => expect(store.writes).toHaveLength(1));
    expect(store.createAccount).toHaveBeenCalledWith('bea');
    expect(host.state.linkedWith).toBe('merge');
    expect(store.listens).toEqual([{ uid: 'bea', cursor: null, open: true }]);
    expect(store.writes[0]).toEqual({
      uid: 'bea',
      docs: [doc('s1')],
      meta: { deviceId: 'desk', epoch: 1, schema: SYNC_SCHEMA },
    });
    expect(engine.getView()).toMatchObject({ phase: 'syncing', pending: 1, user: bea() });

    // Its echo comes back: sent, and up to date
    store.emit({ docs: [{ docId: 'session~s1', json: '{}', schema: 1 }], cursor: 'c1' });
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
    expect(host.state.applied).toEqual([{ docs: [{ docId: 'session~s1', json: '{}', schema: 1 }], cursor: 'c1' }]);
  });

  it('asks how to join when this device and the cloud both have data', async () => {
    for (const mode of ['merge', 'replace'] as const) {
      store = createFakeCloudStore();
      store.setEpoch('bea', 3);
      store.setHasData('bea', true);
      const host = syncHost({ hasData: true });
      const engine = await started(host);
      store.setUser(bea());
      await vi.waitFor(() => expect(phaseOf(engine)).toBe('choose'));
      expect(store.createAccount).not.toHaveBeenCalled();
      await engine.choose(mode);
      expect(host.state.account).toEqual({ uid: 'bea', epoch: 3 });
      expect(host.state.linkedWith).toBe(mode);
      expect(phaseOf(engine)).toBe('synced');
    }
  });

  it('says why joining was refused', async () => {
    store.setEpoch('bea', 1);
    store.setHasData('bea', true);
    const host = syncHost({ hasData: true });
    const engine = await started(host);
    store.setUser(bea());
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('choose'));
    host.backend.call.mockRejectedValueOnce('Failed to read appdata.json: oops');
    await engine.choose('replace');
    expect(engine.getView()).toMatchObject({ phase: 'error', error: 'Failed to read appdata.json: oops' });
  });

  it('joins without asking when only one side has data', async () => {
    store.setEpoch('bea', 2);
    const host = syncHost({ hasData: true });
    const engine = await started(host);
    store.setUser(bea());
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
    expect(store.hasData).toHaveBeenCalledWith('bea');
    expect(host.state.linkedWith).toBe('merge');
  });

  it('carries on from where it read up to, on the account it linked', async () => {
    const host = syncHost({ account: { uid: 'bea', epoch: 4 }, held: 2 });
    host.state.cursor = 'c9';
    store.setEpoch('bea', 4);
    const engine = await started(host);
    store.setUser(bea());
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
    expect(store.listens).toEqual([{ uid: 'bea', cursor: 'c9', open: true }]);
    expect(engine.getView().held).toBe(2);
    expect(store.account).not.toHaveBeenCalled();
  });

  it('leaves a device on another account alone until told to switch', async () => {
    const host = syncHost({ account: { uid: 'cal', epoch: 1 }, hasData: true });
    const engine = await started(host);
    store.setUser(bea());
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('otherAccount'));
    expect(store.listens).toEqual([]);
    await engine.syncThisAccount();
    expect(host.state.account).toEqual({ uid: 'bea', epoch: 1 });
    expect(phaseOf(engine)).toBe('synced');
  });

  it('stops following the account on signing out, and links nobody when signed out meanwhile', async () => {
    const host = syncHost();
    const engine = await started(host);
    let answer!: (epoch: number | null) => void;
    vi.mocked(store.account).mockImplementationOnce(() => new Promise(resolve => (answer = resolve)));
    store.setUser(bea());
    await vi.waitFor(() => expect(store.account).toHaveBeenCalled());
    store.setUser(null);
    answer(1);
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('signedOut'));
    expect(host.state.account).toBeNull();

    store.setUser(bea());
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
    store.setUser(null);
    expect(store.listens.at(-1)!.open).toBe(false);
    expect(engine.getView()).toMatchObject({ phase: 'signedOut', user: null });
  });

  it('drops what a sign-out overtook', async () => {
    const host = syncHost();
    const engine = await started(host);
    let status!: () => void;
    const original = host.backend.call.getMockImplementation()!;
    host.backend.call.mockImplementationOnce(
      (command, args) => new Promise(resolve => (status = () => resolve(original(command, args))))
    );
    store.setUser(bea());
    await vi.waitFor(() => expect(status).toBeDefined());
    store.setUser(null);
    status();
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('signedOut'));
    expect(store.listens).toEqual([]);

    // A failure for an earlier sign-in isn’t this one’s
    host.backend.call.mockImplementationOnce(() => Promise.reject(new Error('late')));
    store.setUser(bea());
    store.setUser(null);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(engine.getView()).toMatchObject({ phase: 'signedOut', error: null });
  });
});

describe('cloud sync, linked', () => {
  async function linked(host = syncHost({ account: { uid: 'bea', epoch: 1 } })) {
    store.setEpoch('bea', 1);
    const engine = await started(host);
    store.setUser(bea());
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
    return { engine, host };
  }

  it('sends this device’s changes once, until they come back', async () => {
    const { engine, host } = await linked();
    host.state.outgoing = [doc('s1')];
    host.backend.emit(EVENTS.SYNC_PENDING);
    host.backend.emit(EVENTS.SYNC_PENDING);
    await vi.waitFor(() => expect(store.writes).toHaveLength(1));
    engine.syncNow();
    await vi.waitFor(() => expect(store.listens).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(store.writes).toHaveLength(1);
    // Changed again before it came back: sent again
    host.state.outgoing = [doc('s1', 'h2')];
    engine.syncNow();
    await vi.waitFor(() => expect(store.writes).toHaveLength(2));
    expect(engine.getView()).toMatchObject({ phase: 'syncing', pending: 1 });
  });

  it('says why sending failed, and sends again later', async () => {
    const { engine, host } = await linked();
    const errors: (string | null)[] = [];
    engine.subscribe(() => errors.push(engine.getView().error));
    vi.mocked(store.write).mockRejectedValueOnce({ code: 'unavailable' });
    host.state.outgoing = [doc('s1')];
    engine.syncNow();
    await vi.waitFor(() => expect(store.writes).toHaveLength(1));
    expect(errors).toContain('Can’t reach the cloud. Changes will sync once it’s back.');
    expect(phaseOf(engine)).toBe('syncing');
  });

  it('forgets a failed send that a sign-out overtook', async () => {
    const { engine, host } = await linked();
    let fail!: (error: unknown) => void;
    vi.mocked(store.write).mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    host.state.outgoing = [doc('s1')];
    engine.syncNow();
    await vi.waitFor(() => expect(store.write).toHaveBeenCalled());
    store.setUser(null);
    fail(new Error('gone'));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(engine.getView()).toMatchObject({ phase: 'signedOut', error: null });
  });

  it('applies what comes in, in order, and drops a batch a sign-out overtook', async () => {
    const { host } = await linked();
    store.emit({ docs: [{ docId: 'record~dailyGoal', json: '{}', schema: 1 }], cursor: null });
    await vi.waitFor(() => expect(host.state.applied).toHaveLength(1));

    let release!: () => void;
    const original = host.backend.call.getMockImplementation()!;
    host.backend.call.mockImplementationOnce(
      (command, args) => new Promise(resolve => (release = () => resolve(original(command, args))))
    );
    store.emit({ docs: [], cursor: 'c2' });
    store.emit({ docs: [{ docId: 'session~late', json: null, schema: 1 }], cursor: 'c3' });
    await vi.waitFor(() => expect(release).toBeDefined());
    store.setUser(null);
    release();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(host.state.applied).toHaveLength(2);
  });

  it('says so when the cloud’s changes can’t be applied or read, and tries again', async () => {
    const { engine, host } = await linked();
    host.backend.call.mockRejectedValueOnce('Invalid arguments');
    store.emit({ docs: [], cursor: 'c1' });
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('error'));
    expect(engine.getView().error).toBe('Invalid arguments');
    expect(store.listens[0].open).toBe(false);

    await engine.retry();
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
    store.emitError({ code: 'permission-denied' });
    expect(engine.getView().error).toBe('The cloud refused this device’s data. Sign out and in again.');
    expect(host.state.account).not.toBeNull();
  });

  it('stops when the cloud data is deleted elsewhere, and can start again', async () => {
    const { engine, host } = await linked();
    store.setEpoch('bea', 1);
    expect(phaseOf(engine)).toBe('synced');
    store.setEpoch('bea', 2);
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('cloudReset'));
    expect(host.state.account).toBeNull();
    await engine.syncThisAccount();
    expect(host.state.account).toEqual({ uid: 'bea', epoch: 2 });
    expect(phaseOf(engine)).toBe('synced');
  });

  it('resolves the first sync once the cloud has answered, and at once after that', async () => {
    // Signed in already, as the web app starts it
    store.setEpoch('bea', 1);
    store.setUser(bea());
    const host = syncHost({ account: { uid: 'bea', epoch: 1 } });
    const engine = await started(host);
    let done = false;
    const first = engine.firstSync().then(() => (done = true));
    await vi.waitFor(() => expect(store.listens).toHaveLength(1));
    expect(done).toBe(false);
    store.emit({ docs: [], cursor: null });
    await first;
    await engine.firstSync();
  });

  it("doesn't keep the first sync waiting when nothing will come", async () => {
    const engine = await started(syncHost());
    await engine.firstSync();
  });

  it('deletes the account: its cloud data, then itself', async () => {
    const { engine, host } = await linked();
    await engine.deleteAccount();
    expect(store.deleteAll).toHaveBeenCalledWith('bea', 1);
    expect(store.deleteUser).toHaveBeenCalled();
    expect(host.state.account).toBeNull();

    // Again (Firebase wanted a fresh sign-in): the data is gone already
    await engine.deleteAccount();
    expect(store.deleteAll).toHaveBeenCalledTimes(1);
    expect(store.deleteUser).toHaveBeenCalledTimes(2);
  });

  it('deletes the cloud data, stopping this device too', async () => {
    const { engine, host } = await linked();
    await engine.deleteCloudData();
    expect(store.deleteAll).toHaveBeenCalledWith('bea', 1);
    expect(host.state.account).toBeNull();
    expect(phaseOf(engine)).toBe('cloudReset');
  });

  it('stops syncing this device and signs out, keeping its data', async () => {
    const { engine, host } = await linked();
    const seen = vi.fn();
    const unsubscribe = engine.subscribe(seen);
    await engine.stopSyncing();
    unsubscribe();
    expect(host.state.account).toBeNull();
    expect(phaseOf(engine)).toBe('signedOut');
    expect(seen).toHaveBeenCalled();
    expect(host.backend.call).not.toHaveBeenCalledWith('reset_all_app_data');
  });

  it('sends nothing for a change while not linked', async () => {
    const host = syncHost({ outgoing: [doc('s1')] });
    await started(host);
    host.backend.emit(EVENTS.SYNC_PENDING);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(host.backend.call).not.toHaveBeenCalled();
  });
});
