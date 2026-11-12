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

const OPTIONS = { sendDelayMs: 5, retryMs: 20, publishDelayMs: 50, publishRetryMs: 100 };

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
    const google = vi.fn(async () => 'token');
    const withGoogle = new SyncEngine(asBackend(syncHost().backend), async () => store, OPTIONS, google);
    await withGoogle.start();
    expect(withGoogle.canUseGoogle).toBe(true);
    await withGoogle.signInWithGoogle('dark');
    expect(google).toHaveBeenCalledWith('dark');
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
    const published = { json: '{}', hash: 'h', schema: 1, appVersion: '4.2.0', deviceId: 'desk', epoch: 1 };
    store.published.set('bea/payoutForecast', published);
    store.published.set('cal/payoutForecast', published);
    await engine.deleteCloudData();
    expect(store.deleteAll).toHaveBeenCalledWith('bea', 1);
    // The published forecast goes with it (and only the account's)
    expect([...store.published.keys()]).toEqual(['cal/payoutForecast']);
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

describe('cloud sync, publishing the payout forecast', () => {
  const forecast = (hash: string) => ({ json: `{"h":"${hash}"}`, hash, schema: 1, appVersion: '4.2.0' });
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const META = { deviceId: 'desk', epoch: 1 };

  /** Linked, with the cloud's data in. */
  async function caughtUp(host = syncHost({ account: { uid: 'bea', epoch: 1 } })) {
    store.setEpoch('bea', 1);
    const engine = await started(host);
    store.setUser(bea());
    await vi.waitFor(() => expect(store.listens.filter(listen => listen.open)).toHaveLength(1));
    store.emit({ docs: [], cursor: 'c1' });
    await vi.waitFor(() => expect(host.state.applied.length).toBeGreaterThan(0));
    return { engine, host };
  }

  it('publishes once linked and the cloud’s data is in, shortly after it changes', async () => {
    const host = syncHost({ account: { uid: 'bea', epoch: 1 } });
    store.setEpoch('bea', 1);
    const engine = await started(host);
    // Signed out: nowhere to publish
    engine.publishForecast(forecast('a'));
    store.setUser(bea());
    await vi.waitFor(() => expect(phaseOf(engine)).toBe('synced'));
    await sleep(80);
    // Linked, but the forecast may be missing the cloud's data
    expect(store.publish).not.toHaveBeenCalled();
    store.emit({ docs: [], cursor: 'c1' });
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(1));
    expect(store.publish).toHaveBeenCalledWith('bea', 'payoutForecast', forecast('a'), META);
    expect(store.published.get('bea/payoutForecast')).toMatchObject({ hash: 'a', ...META });

    // More of the cloud's data: nothing new to publish
    store.emit({ docs: [], cursor: 'c2' });
    await sleep(80);
    expect(store.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes each change once, the last of a burst', async () => {
    const { engine } = await caughtUp();
    engine.publishForecast(forecast('a'));
    // The cloud's changes coming in meanwhile don't put it off
    store.emit({ docs: [], cursor: 'c2' });
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(1));
    engine.publishForecast(forecast('a'));
    await sleep(80);
    expect(store.publish).toHaveBeenCalledTimes(1);

    engine.publishForecast(forecast('b'));
    engine.publishForecast(forecast('c'));
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(2));
    expect(store.published.get('bea/payoutForecast')).toMatchObject({ hash: 'c' });
  });

  it('doesn’t write what another device has published already', async () => {
    const { engine } = await caughtUp();
    store.published.set('bea/payoutForecast', { ...forecast('a'), deviceId: 'phone', epoch: 1 });
    engine.publishForecast(forecast('a'));
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(1));
    expect(store.published.get('bea/payoutForecast')).toMatchObject({ deviceId: 'phone' });
    // Settled: it isn't tried again
    store.emit({ docs: [], cursor: 'c2' });
    await sleep(80);
    expect(store.publish).toHaveBeenCalledTimes(1);
  });

  it('leaves it to a newer TaskMint while documents wait for one', async () => {
    const { engine } = await caughtUp(syncHost({ account: { uid: 'bea', epoch: 1 }, held: 2 }));
    engine.publishForecast(forecast('a'));
    await sleep(120);
    expect(store.publish).not.toHaveBeenCalled();
  });

  it('tries again later when publishing fails, without a sync error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(store.publish).mockRejectedValueOnce(new Error('Missing or insufficient permissions'));
    const { engine } = await caughtUp();
    engine.publishForecast(forecast('a'));
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(1));
    expect(phaseOf(engine)).toBe('synced');
    expect(warn).toHaveBeenCalledWith('Failed to publish the payout forecast:', expect.any(Error));
    await vi.waitFor(() => expect(store.published.get('bea/payoutForecast')).toMatchObject({ hash: 'a' }));
    expect(store.publish).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('drops a publish that ends after signing out, and publishes again on the next link', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { engine, host } = await caughtUp();
    let finish: (written: boolean) => void = () => undefined;
    vi.mocked(store.publish).mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
    engine.publishForecast(forecast('a'));
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(1));
    store.setUser(null);
    finish(true);
    await sleep(20);

    // A failure after signing out isn't tried again either
    store.setUser(bea());
    await vi.waitFor(() => expect(store.listens.filter(listen => listen.open)).toHaveLength(1));
    let fail: (error: Error) => void = () => undefined;
    vi.mocked(store.publish).mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    store.emit({ docs: [], cursor: 'c2' });
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(2));
    store.setUser(null);
    fail(new Error('offline'));
    await sleep(150);
    expect(store.publish).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();

    // Linked again: published again (the cloud may have lost it meanwhile)
    store.setUser(bea());
    await vi.waitFor(() => expect(store.listens.filter(listen => listen.open)).toHaveLength(1));
    store.emit({ docs: [], cursor: 'c3' });
    await vi.waitFor(() => expect(store.publish).toHaveBeenCalledTimes(3));
    expect(host.state.account).toEqual({ uid: 'bea', epoch: 1 });
    warn.mockRestore();
  });

  it('stops publishing when this device stops syncing', async () => {
    const { engine } = await caughtUp();
    await engine.stopSyncing();
    engine.publishForecast(forecast('a'));
    await sleep(80);
    expect(store.publish).not.toHaveBeenCalled();
  });
});
