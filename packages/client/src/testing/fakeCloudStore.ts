/**
 * A CloudStore in memory, for tests of cloud sync: the test signs users in
 * and out, sets accounts' epochs, and sends the batches the listener gets;
 * the fake records what was written. Each method is a vi.fn, so a test can
 * make one fail (`mockRejectedValueOnce`) or check its calls.
 */

import { vi } from 'vitest';
import type { OutgoingDoc } from '@taskmint/contracts';
import type { CloudBatch, CloudStore, CloudUser, PublishedDoc, WriteMeta } from '../cloud/types';

export interface FakeCloudStore extends CloudStore {
  /** Signs `user` in (null: out), as Firebase reports it. */
  setUser(user: CloudUser | null): void;
  /** The account's epoch as the cloud has it (null: none), announced to its watchers. */
  setEpoch(uid: string, epoch: number | null): void;
  /** Whether the account's cloud copy has data (hasData). */
  setHasData(uid: string, hasData: boolean): void;
  /** Sends a batch to the open listener. */
  emit(batch: CloudBatch): void;
  /** Fails the open listener. */
  emitError(error: unknown): void;
  /** What write() was given, in order. */
  readonly writes: { uid: string; docs: OutgoingDoc[]; meta: WriteMeta }[];
  /** The listeners opened, with the cursor each started from. */
  readonly listens: { uid: string; cursor: string | null; open: boolean }[];
  /** The published documents, by `uid/name`, as the cloud has them. */
  readonly published: Map<string, PublishedDoc & { deviceId: string; epoch: number }>;
  /** Whether BudgetMint's data was deleted, by uid. */
  readonly companionDeleted: Set<string>;
}

export function bea(uid = 'bea'): CloudUser {
  return { uid, email: `${uid}@example.com`, providers: ['password'] };
}

export function createFakeCloudStore(): FakeCloudStore {
  let user: CloudUser | null = null;
  const userListeners = new Set<(user: CloudUser | null) => void>();
  const epochs = new Map<string, number>();
  const filled = new Map<string, boolean>();
  const watchers = new Set<{ uid: string; listener: (epoch: number | null) => void }>();
  let open: { onBatch: (batch: CloudBatch) => void; onError: (error: unknown) => void } | null = null;
  const writes: FakeCloudStore['writes'] = [];
  const listens: FakeCloudStore['listens'] = [];
  const published: FakeCloudStore['published'] = new Map();
  const companionDeleted = new Set<string>();

  const store: FakeCloudStore = {
    onUser: vi.fn((listener: (user: CloudUser | null) => void) => {
      userListeners.add(listener);
      listener(user);
      return () => userListeners.delete(listener);
    }),
    signIn: vi.fn(async (email: string) => store.setUser(bea(email.split('@')[0]))),
    signUp: vi.fn(async (email: string) => store.setUser(bea(email.split('@')[0]))),
    resetPassword: vi.fn(async () => undefined),
    signInWithGoogle: vi.fn(async () => store.setUser({ ...bea(), providers: ['google.com'] })),
    signOut: vi.fn(async () => store.setUser(null)),
    deleteUser: vi.fn(async () => store.setUser(null)),
    account: vi.fn(async (uid: string) => epochs.get(uid) ?? null),
    createAccount: vi.fn(async (uid: string) => {
      epochs.set(uid, 1);
      return 1;
    }),
    watchAccount: vi.fn((uid: string, listener: (epoch: number | null) => void) => {
      const watcher = { uid, listener };
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    }),
    hasData: vi.fn(async (uid: string) => filled.get(uid) ?? false),
    listen: vi.fn((uid: string, cursor: string | null, onBatch, onError) => {
      const entry = { uid, cursor, open: true };
      listens.push(entry);
      const listener = { onBatch, onError };
      open = listener;
      return () => {
        entry.open = false;
        if (open === listener) open = null;
      };
    }),
    write: vi.fn(async (uid: string, docs: OutgoingDoc[], meta: WriteMeta) => {
      writes.push({ uid, docs, meta });
    }),
    deleteAll: vi.fn(async (uid: string, epoch: number) => {
      store.setEpoch(uid, epoch + 1);
      filled.set(uid, false);
      for (const key of [...published.keys()]) if (key.startsWith(`${uid}/`)) published.delete(key);
      return epoch + 1;
    }),
    // As the store's transaction does: the same hash, or a newer contract, isn't written over
    publish: vi.fn(async (uid: string, name: string, doc: PublishedDoc, meta: { deviceId: string; epoch: number }) => {
      const current = published.get(`${uid}/${name}`);
      if (current && (current.hash === doc.hash || current.schema > doc.schema)) return false;
      published.set(`${uid}/${name}`, { ...doc, ...meta });
      return true;
    }),
    deleteCompanionData: vi.fn(async (uid: string) => {
      companionDeleted.add(uid);
    }),

    setUser(next) {
      user = next;
      for (const listener of [...userListeners]) listener(next);
    },
    setEpoch(uid, epoch) {
      if (epoch === null) epochs.delete(uid);
      else epochs.set(uid, epoch);
      for (const watcher of [...watchers]) if (watcher.uid === uid) watcher.listener(epoch);
    },
    setHasData(uid, hasData) {
      filled.set(uid, hasData);
    },
    emit(batch) {
      open?.onBatch(batch);
    },
    emitError(error) {
      open?.onError(error);
    },
    writes,
    listens,
    published,
    companionDeleted,
  };
  return store;
}
