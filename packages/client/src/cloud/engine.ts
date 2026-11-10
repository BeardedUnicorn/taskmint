/**
 * Cloud sync on this device: it keeps the backend's data (the desktop's
 * files, the web app's page) and the signed-in account's cloud copy in step.
 * The rules (what changed, how two sides merge) are the backend's: core's
 * sync commands. This moves the documents and follows the account:
 *
 * - Signed in, an unlinked device links to the account. When both it and
 *   the cloud have data, the user chooses: join them, or take the cloud's.
 * - Linked, it reads the cloud's changes as they're written and applies
 *   them, and sends this device's changes (`sync-pending`) shortly after
 *   they're made. A document it sent counts as sent once it comes back.
 * - Deleting the cloud data (from any device) moves the account to a new
 *   epoch, and a device still on the old one stops syncing, keeping its data.
 */

import { EVENTS, SYNC_SCHEMA, type OutgoingDoc, type SyncStatus } from '@taskmint/contracts';
import type { Backend } from '../backend';
import type { CloudBatch, CloudStore, CloudUser, Unsubscribe } from './types';
import { cloudErrorMessage } from './errors';

export type SyncPhase =
  /** The Firebase SDK is loading. */
  | 'loading'
  | 'signedOut'
  | 'connecting'
  /** Both this device and the cloud have data: merge, or replace this device's? */
  | 'choose'
  /** This device syncs with an account other than the one signed in. */
  | 'otherAccount'
  | 'synced'
  /** Changes on their way to the cloud. */
  | 'syncing'
  | 'error'
  /** The cloud data was deleted (from another device): this device stopped syncing. */
  | 'cloudReset';

export interface SyncView {
  phase: SyncPhase;
  user: CloudUser | null;
  /** Changes here the cloud doesn't have yet. */
  pending: number;
  /** Documents from a newer TaskMint, left alone until this one is updated. */
  held: number;
  error: string | null;
}

export interface EngineOptions {
  /** How long after a change it's sent, so a burst goes in one write. */
  sendDelayMs: number;
  /** How long after a failure it tries again. */
  retryMs: number;
}

export const ENGINE_OPTIONS: EngineOptions = { sendDelayMs: 1000, retryMs: 30_000 };

/** Phases where no data is on its way, so nothing waits for it (firstSync). */
const WAITS_FOR_NOTHING = new Set<SyncPhase>(['signedOut', 'choose', 'otherAccount', 'error', 'cloudReset']);

export class SyncEngine {
  private store: CloudStore | null = null;
  private view: SyncView = { phase: 'loading', user: null, pending: 0, held: 0, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: Unsubscribe[] = [];
  /** While linked: the cloud's changes, and the account's epoch. */
  private watching: Unsubscribe[] = [];
  private linked: { uid: string; epoch: number; deviceId: string } | null = null;
  /** The epoch to link with once the user chooses how. */
  private choosing: number | null = null;
  /** Sent, by document, with the hash sent, until it comes back. */
  private readonly sent = new Map<string, string>();
  /** Backend calls run one at a time, in order. */
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on each change of user, so work for an earlier one is dropped. */
  private generation = 0;
  /** Waiting for the cloud's data to first come in (firstSync). */
  private caughtUp = false;
  private readonly waiting: (() => void)[] = [];

  /**
   * `google` gets a Google ID token the shell's own way (null: Firebase's
   * popup does it); none when this build can't sign in with Google.
   */
  constructor(
    private readonly backend: Backend,
    private readonly loadStore: () => Promise<CloudStore>,
    private readonly options: EngineOptions = ENGINE_OPTIONS,
    private readonly google: (() => Promise<string | null>) | null = null
  ) {}

  /** Whether "Continue with Google" can work here. */
  get canUseGoogle(): boolean {
    return this.google !== null;
  }

  async start(): Promise<void> {
    this.unsubscribe.push(this.backend.subscribe(EVENTS.SYNC_PENDING, () => this.send(this.options.sendDelayMs)));
    try {
      this.store = await this.loadStore();
    } catch (error) {
      this.set({ phase: 'error', error: cloudErrorMessage(error) });
      return;
    }
    this.unsubscribe.push(this.store.onUser(user => void this.userChanged(user)));
  }

  stop(): void {
    this.detach();
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
  }

  getView = (): SyncView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The store, once loaded (the Settings section only acts after it is). */
  private get cloud(): CloudStore {
    return this.store!;
  }

  // ---- Signing in and out ---------------------------------------------------

  signIn = (email: string, password: string) => this.cloud.signIn(email, password);
  signUp = (email: string, password: string) => this.cloud.signUp(email, password);
  resetPassword = (email: string) => this.cloud.resetPassword(email);
  signInWithGoogle = async () => this.cloud.signInWithGoogle(await this.google!());
  /** Signs out (nothing to do before the SDK has loaded: nobody can be signed in yet). */
  signOut = async () => {
    await this.store?.signOut();
  };

  // ---- What the user decides ------------------------------------------------

  /** Links after `choose`: join this device's data with the cloud's, or take the cloud's. */
  async choose(mode: 'merge' | 'replace'): Promise<void> {
    const user = this.view.user!;
    const epoch = this.choosing!;
    this.choosing = null;
    const generation = this.generation;
    try {
      const status = await this.run(() => this.backend.call('link_sync_account', { uid: user.uid, epoch, mode }));
      this.follow(user.uid, status, generation);
    } catch (error) {
      this.fail(error, generation);
    }
  }

  /** Stops syncing this device (its data stays) and signs out. */
  async stopSyncing(): Promise<void> {
    this.detach();
    await this.run(() => this.backend.call('unlink_sync_account'));
    await this.signOut();
  }

  /** `otherAccount` or `cloudReset`: syncs this device with the signed-in account from now on. */
  async syncThisAccount(): Promise<void> {
    await this.run(() => this.backend.call('unlink_sync_account'));
    await this.connect(this.view.user!, this.generation);
  }

  /**
   * Deletes the account's cloud data. Every device stops syncing (this one
   * too) and keeps its own data.
   */
  async deleteCloudData(): Promise<void> {
    const { uid, epoch } = this.linked!;
    // (A failure leaves it syncing, to try again)
    await this.cloud.deleteAll(uid, epoch);
    this.detach();
    await this.run(() => this.backend.call('unlink_sync_account'));
    this.set({ phase: 'cloudReset', pending: 0, held: 0 });
  }

  /**
   * Deletes the account: its cloud data, then the account itself. Firebase
   * may want a recent sign-in for the second; trying again then skips the
   * data, already gone.
   */
  async deleteAccount(): Promise<void> {
    if (this.linked) await this.deleteCloudData();
    await this.cloud.deleteUser();
  }

  /**
   * Resolves once the cloud's data has first come in, or once there's none
   * to wait for (signed out, a choice to make, an error). The web app waits
   * for it before showing anything: until then its page holds no data.
   */
  firstSync(): Promise<void> {
    return this.caughtUp ? Promise.resolve() : new Promise(resolve => this.waiting.push(resolve));
  }

  private catchUp(): void {
    this.caughtUp = true;
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  /** After an error: starts over with the signed-in user. */
  retry = () => this.userChanged(this.view.user);

  /** Sends what changed now. */
  syncNow = () => this.send(0);

  // ---- Inside ---------------------------------------------------------------

  private set(changes: Partial<SyncView>): void {
    this.view = { ...this.view, ...changes };
    if (WAITS_FOR_NOTHING.has(this.view.phase)) this.catchUp();
    for (const listener of this.listeners) listener();
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private detach(): void {
    for (const unsubscribe of this.watching.splice(0)) unsubscribe();
    this.linked = null;
    this.sent.clear();
    clearTimeout(this.timer);
  }

  private fail(error: unknown, generation: number): void {
    if (generation !== this.generation) return;
    this.detach();
    this.set({ phase: 'error', error: cloudErrorMessage(error) });
  }

  private async userChanged(user: CloudUser | null): Promise<void> {
    const generation = ++this.generation;
    this.detach();
    this.choosing = null;
    if (!user) {
      this.set({ phase: 'signedOut', user: null, error: null, pending: 0, held: 0 });
      return;
    }
    this.set({ phase: 'connecting', user, error: null });
    await this.connect(user, generation);
  }

  /** Links if this device isn't yet, then follows the account. */
  private async connect(user: CloudUser, generation: number): Promise<void> {
    try {
      const status = await this.run(() => this.backend.call('get_sync_status'));
      if (generation !== this.generation) return;
      if (status.account && status.account.uid !== user.uid) {
        this.set({ phase: 'otherAccount' });
        return;
      }
      if (!status.account) {
        const epoch = (await this.cloud.account(user.uid)) ?? (await this.cloud.createAccount(user.uid));
        const both = status.hasData && (await this.cloud.hasData(user.uid));
        // Signed out (or in as someone else) meanwhile: link nobody
        if (generation !== this.generation) return;
        if (both) {
          this.choosing = epoch;
          this.set({ phase: 'choose' });
          return;
        }
        const linked = await this.run(() =>
          this.backend.call('link_sync_account', { uid: user.uid, epoch, mode: 'merge' })
        );
        this.follow(user.uid, linked, generation);
        return;
      }
      this.follow(user.uid, status, generation);
    } catch (error) {
      this.fail(error, generation);
    }
  }

  /** Reads the account's changes and watches its epoch, then sends this device's. */
  private follow(uid: string, status: SyncStatus, generation: number): void {
    const epoch = status.account!.epoch;
    this.linked = { uid, epoch, deviceId: status.deviceId };
    this.watching.push(
      this.cloud.watchAccount(uid, current => {
        if (current !== epoch) void this.reset();
      }),
      this.cloud.listen(
        uid,
        status.cursor,
        batch => void this.receive(batch, generation),
        error => this.fail(error, generation)
      )
    );
    this.update(status);
    this.send(0);
  }

  /** The cloud data was deleted elsewhere: stop, keeping this device's data. */
  private async reset(): Promise<void> {
    this.detach();
    await this.run(() => this.backend.call('unlink_sync_account'));
    this.set({ phase: 'cloudReset', pending: 0, held: 0 });
  }

  private async receive(batch: CloudBatch, generation: number): Promise<void> {
    try {
      await this.run(async () => {
        if (generation !== this.generation) return;
        await this.backend.call('apply_sync_incoming', { docs: batch.docs, cursor: batch.cursor });
        for (const doc of batch.docs) this.sent.delete(doc.docId);
      });
      this.catchUp();
      // A merge may have something to send back
      this.send(0);
    } catch (error) {
      this.fail(error, generation);
    }
  }

  private send(delayMs: number): void {
    clearTimeout(this.timer);
    if (!this.linked) return;
    const generation = this.generation;
    // (Unlinking clears the timer, so it fires only while linked)
    this.timer = setTimeout(() => void this.push(generation), delayMs);
  }

  private async push(generation: number): Promise<void> {
    const linked = this.linked!;
    let fresh: OutgoingDoc[] = [];
    try {
      const status = await this.run(async () => {
        const outgoing = await this.backend.call('get_sync_outgoing');
        fresh = outgoing.filter(doc => this.sent.get(doc.docId) !== doc.hash);
        for (const doc of fresh) this.sent.set(doc.docId, doc.hash);
        return this.backend.call('get_sync_status');
      });
      this.update(status);
      if (fresh.length > 0) {
        await this.cloud.write(linked.uid, fresh, {
          deviceId: linked.deviceId,
          epoch: linked.epoch,
          schema: SYNC_SCHEMA,
        });
      }
    } catch (error) {
      if (generation !== this.generation) return;
      // Sent again later; the listener carries on
      for (const doc of fresh) this.sent.delete(doc.docId);
      this.set({ phase: 'error', error: cloudErrorMessage(error) });
      this.send(this.options.retryMs);
    }
  }

  private update(status: SyncStatus): void {
    this.set({
      phase: status.pending > 0 ? 'syncing' : 'synced',
      pending: status.pending,
      held: status.held,
      error: null,
    });
  }
}
