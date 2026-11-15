/**
 * Cloud sync on this device: it keeps the backend's data (the desktop's
 * files, the web app's page) and the signed-in account's cloud copy in step.
 * The rules (what changed, how two sides merge) are the backend's: core's
 * sync commands. This moves the documents and follows the account:
 *
 * - Signed in, an unlinked device links to the account. When both it and
 *   the cloud have data, the user chooses: join them, or take the cloud's.
 *   So too when the device's data came from another account (it last
 *   synced with one), even with the cloud empty: it doesn't go there unasked.
 * - Linked, it reads the cloud's changes as they're written and applies
 *   them, and sends this device's changes (`sync-pending`) shortly after
 *   they're made. A document it sent counts as sent once it comes back.
 * - Deleting the cloud data (from any device) moves the account to a new
 *   epoch, and a device still on the old one stops syncing, keeping its data.
 * - Linked, a phone's own code is told the account (`background`), so it
 *   reads the published widgets with the page closed; and told to stop once
 *   this device no longer syncs with the signed-in account. An error doesn't
 *   stop it: the link stands.
 * - Linked and caught up, it publishes what's read without TaskMint's data:
 *   the payout forecast other apps read (utils/payoutForecast) and the
 *   widgets' figures a closed phone reads (widgets/publishedWidgets),
 *   whenever this device's change, after a pause.
 */

import { EVENTS, SYNC_SCHEMA, type OutgoingDoc, type SyncStatus } from '@taskmint/contracts';
import type { Backend } from '../backend';
import type { CloudBatch, CloudStore, CloudUser, PublishedDoc, Unsubscribe } from './types';
import { cloudErrorMessage } from './errors';

export type SyncPhase =
  /** The Firebase SDK is loading. */
  | 'loading'
  | 'signedOut'
  | 'connecting'
  /**
   * Both this device and the cloud have data, or this device's came from
   * another account: merge, or replace this device's?
   */
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
  /** In `choose`: this device's data came from another account, and the cloud has none. */
  fromOtherAccount: boolean;
}

export interface EngineOptions {
  /** How long after a change it's sent, so a burst goes in one write. */
  sendDelayMs: number;
  /** How long after a failure it tries again. */
  retryMs: number;
  /** How long after a published document changes it's written, so a burst of changes is one write. */
  publishDelayMs: number;
  /** How long after a failed publish it tries again (an older ruleset refuses it until it's deployed). */
  publishRetryMs: number;
}

/** Where a phone's own code is told which account to read with the page closed (index.ts). */
export interface BackgroundLink {
  set(link: { uid: string; epoch: number; deviceId: string; refreshToken: string }): void;
  clear(): void;
}

export const ENGINE_OPTIONS: EngineOptions = {
  sendDelayMs: 1000,
  retryMs: 30_000,
  publishDelayMs: 5000,
  publishRetryMs: 5 * 60_000,
};

/** The published payout forecast's document (utils/payoutForecast PAYOUT_FORECAST_DOC). */
export const FORECAST_DOC = 'payoutForecast';
/** The published widgets' document (widgets/publishedWidgets WIDGETS_DOC). */
export const WIDGETS_DOC = 'widgets';

/** A published document as this device has it, and the hash it last published while linked. */
interface PublishSlot {
  doc: PublishedDoc;
  publishedHash: string | null;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** Phases where no data is on its way, so nothing waits for it (firstSync). */
const WAITS_FOR_NOTHING = new Set<SyncPhase>(['signedOut', 'choose', 'otherAccount', 'error', 'cloudReset']);

export class SyncEngine {
  private store: CloudStore | null = null;
  private view: SyncView = { phase: 'loading', user: null, pending: 0, held: 0, error: null, fromOtherAccount: false };
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
  /** Sends on their way: each ends with null once the cloud has it, or with why it doesn't. */
  private readonly sending = new Set<Promise<string | null>>();
  /** Bumped on each change of user, so work for an earlier one is dropped. */
  private generation = 0;
  /** Waiting for the cloud's data to first come in (firstSync). */
  private caughtUp = false;
  private readonly waiting: (() => void)[] = [];
  /** What this device publishes, by document name. */
  private readonly published = new Map<string, PublishSlot>();
  /** The cloud's data has come in since linking, so what's published counts it. */
  private received = false;

  /**
   * `google` gets a Google ID token the shell's own way (null: Firebase's
   * popup does it), given the app's theme; none when this build can't sign
   * in with Google. `background` is the phone's own sync (none elsewhere).
   */
  constructor(
    private readonly backend: Backend,
    private readonly loadStore: () => Promise<CloudStore>,
    private readonly options: EngineOptions = ENGINE_OPTIONS,
    private readonly google: ((theme: 'light' | 'dark') => Promise<string | null>) | null = null,
    private readonly background: BackgroundLink | null = null
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
  /** Signs in with Google; `theme` is the app's, for the shell's sign-in page. */
  signInWithGoogle = async (theme: 'light' | 'dark') => this.cloud.signInWithGoogle(await this.google!(theme));
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

  /**
   * Signs out and stops syncing this device; its data stays. Signing out
   * comes first: if it fails, nothing has changed, and syncing carries on.
   */
  async stopSyncing(): Promise<void> {
    this.detach();
    try {
      await this.signOut();
    } catch (error) {
      // Still signed in and linked: pick up where it left off
      void this.connect(this.view.user!, this.generation);
      throw error;
    }
    await this.run(() => this.backend.call('unlink_sync_account'));
  }

  /**
   * `otherAccount` or `cloudReset`: syncs this device with the signed-in
   * account from now on (the user said its data may go there).
   */
  async syncThisAccount(): Promise<void> {
    await this.run(() => this.backend.call('unlink_sync_account'));
    await this.connect(this.view.user!, this.generation, true);
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
    this.background?.clear();
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
   * The payout forecast as this device now has it: published shortly, once
   * this device is linked and has the cloud's data, unless the cloud already
   * has it. Only a change here publishes: another device's forecast doesn't.
   */
  publishForecast(doc: PublishedDoc): void {
    this.offer(FORECAST_DOC, doc);
  }

  /**
   * The widgets' figures as this device now has them (widgets/publishedWidgets),
   * published as the forecast is: a phone with TaskMint closed reads them.
   */
  publishWidgets(doc: PublishedDoc): void {
    this.offer(WIDGETS_DOC, doc);
  }

  private offer(name: string, doc: PublishedDoc): void {
    const slot = this.published.get(name);
    if (doc.hash === slot?.doc.hash) return;
    this.published.set(name, { doc, publishedHash: slot?.publishedHash ?? null, timer: slot?.timer });
    this.schedulePublish(name, this.options.publishDelayMs);
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

  /**
   * Sends what changed now and resolves once the cloud has all of it, the
   * sends already on their way too. A page whose data is only in the cloud
   * waits for this before it reloads: what hasn't been sent is gone with the
   * page. Rejects with why when this device isn't syncing or the cloud didn't
   * take it (a failed send is tried again later, as ever).
   */
  async flush(): Promise<void> {
    if (!this.linked) throw new Error('Sync isn’t running right now.');
    // This send has whatever the waiting one would
    clearTimeout(this.timer);
    const failures = await Promise.all([...this.sending, this.push(this.generation)]);
    const failure = failures.find(why => why !== null);
    if (failure !== undefined) throw new Error(failure);
  }

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
    for (const slot of this.published.values()) {
      clearTimeout(slot.timer);
      slot.timer = undefined;
      slot.publishedHash = null;
    }
    this.received = false;
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
      this.background?.clear();
      this.set({ phase: 'signedOut', user: null, error: null, pending: 0, held: 0 });
      return;
    }
    this.set({ phase: 'connecting', user, error: null });
    await this.connect(user, generation);
  }

  /**
   * Links if this device isn't yet, then follows the account. `agreed`: the
   * user already said this device's data may join the account's.
   */
  private async connect(user: CloudUser, generation: number, agreed = false): Promise<void> {
    try {
      const status = await this.run(() => this.backend.call('get_sync_status'));
      if (generation !== this.generation) return;
      if (status.account && status.account.uid !== user.uid) {
        this.background?.clear();
        this.set({ phase: 'otherAccount' });
        return;
      }
      if (!status.account) {
        const epoch = (await this.cloud.account(user.uid)) ?? (await this.cloud.createAccount(user.uid));
        const both = status.hasData && (await this.cloud.hasData(user.uid));
        const fromOtherAccount =
          !both && !agreed && status.hasData && status.previousUid !== null && status.previousUid !== user.uid;
        // Signed out (or in as someone else) meanwhile: link nobody
        if (generation !== this.generation) return;
        if (both || fromOtherAccount) {
          this.choosing = epoch;
          this.background?.clear();
          this.set({ phase: 'choose', fromOtherAccount });
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
    const refreshToken = this.cloud.refreshToken();
    if (refreshToken) this.background?.set({ uid, epoch, deviceId: status.deviceId, refreshToken });
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
    this.background?.clear();
    await this.run(() => this.backend.call('unlink_sync_account'));
    this.set({ phase: 'cloudReset', pending: 0, held: 0 });
  }

  private async receive(batch: CloudBatch, generation: number): Promise<void> {
    try {
      await this.run(async () => {
        if (generation !== this.generation) return;
        await this.backend.call('apply_sync_incoming', { docs: batch.docs, cursor: batch.cursor });
        for (const doc of batch.docs) this.sent.delete(doc.docId);
        this.received = true;
      });
      this.catchUp();
      // A merge may have something to send back
      this.send(0);
      // What's published waits for the cloud's data (unless it's already on its way)
      for (const [name, slot] of this.published) {
        if (slot.timer === undefined) this.schedulePublish(name, this.options.publishDelayMs);
      }
    } catch (error) {
      this.fail(error, generation);
    }
  }

  private schedulePublish(name: string, delayMs: number): void {
    const slot = this.published.get(name)!;
    clearTimeout(slot.timer);
    slot.timer = undefined;
    if (!this.linked || slot.doc.hash === slot.publishedHash) return;
    const generation = this.generation;
    // (Unlinking clears the timer, so it fires only while linked)
    slot.timer = setTimeout(() => void this.publishNow(name, generation), delayMs);
  }

  /**
   * Publishes a document if this device has all the cloud's data: none held
   * back for a newer TaskMint, which would publish its own. A failure isn't
   * sync's: it's tried again later, quietly.
   */
  private async publishNow(name: string, generation: number): Promise<void> {
    const slot = this.published.get(name)!;
    slot.timer = undefined;
    const linked = this.linked!;
    const { doc } = slot;
    if (!this.received || this.view.held > 0) return;
    try {
      await this.cloud.publish(linked.uid, name, doc, {
        deviceId: linked.deviceId,
        epoch: linked.epoch,
      });
      if (generation === this.generation) this.published.get(name)!.publishedHash = doc.hash;
    } catch (error) {
      if (generation !== this.generation) return;
      console.warn(`Failed to publish ${name}:`, error);
      this.schedulePublish(name, this.options.publishRetryMs);
    }
  }

  private send(delayMs: number): void {
    clearTimeout(this.timer);
    if (!this.linked) return;
    const generation = this.generation;
    // (Unlinking clears the timer, so it fires only while linked)
    this.timer = setTimeout(() => void this.push(generation), delayMs);
  }

  /** Sends what changed: null once the cloud has it, else why it doesn't. */
  private push(generation: number): Promise<string | null> {
    const sending = this.deliver(generation);
    this.sending.add(sending);
    void sending.then(() => this.sending.delete(sending));
    return sending;
  }

  private async deliver(generation: number): Promise<string | null> {
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
      return null;
    } catch (error) {
      const why = cloudErrorMessage(error);
      if (generation !== this.generation) return why;
      // Sent again later; the listener carries on
      for (const doc of fresh) this.sent.delete(doc.docId);
      this.set({ phase: 'error', error: why });
      this.send(this.options.retryMs);
      return why;
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
