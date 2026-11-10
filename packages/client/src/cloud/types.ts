/**
 * Cloud sync's view of Firebase (Auth and Firestore), as a seam: the sync
 * engine and the Settings section use only this, so they run the same over
 * the real SDK (firebaseStore.ts) and over the fake the tests use.
 *
 * The cloud copy is laid out in crates/taskmint-core/src/sync and guarded by
 * firebase/firestore.rules: `users/{uid}` holds the account's epoch, and
 * `users/{uid}/data/{docId}` one document per synced entity.
 */

import type { OutgoingDoc } from '@taskmint/contracts';

/** What a shell's build passes in to sync (its Firebase web app). */
export interface CloudConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
  /**
   * Keep Firestore's cache and unsent writes across launches. The web app
   * needs it (the page holds the only copy); the desktop and phone apps keep
   * their data in their own files.
   */
  persistentCache: boolean;
  /** Google sign-in in a popup (a browser). The apps' webviews can't open one. */
  popupSignIn: boolean;
  /** Development builds: the Auth and Firestore emulators on this host. */
  emulatorHost?: string;
}

export interface CloudUser {
  uid: string;
  email: string | null;
  /** How they sign in: "password", "google.com". */
  providers: string[];
}

/** A document from the cloud, the server's copy (never a write still in flight). */
export interface CloudDoc {
  docId: string;
  /** The entity's JSON; null for a deleted one. */
  json: string | null;
  schema: number;
}

/** Documents in the order they were written, and where reading carries on from. */
export interface CloudBatch {
  docs: CloudDoc[];
  /** null while the server hasn't answered (only cached documents so far). */
  cursor: string | null;
}

/** Written into every document. */
export interface WriteMeta {
  deviceId: string;
  epoch: number;
  schema: number;
}

export type Unsubscribe = () => void;

export interface CloudStore {
  /** The signed-in user, now and whenever it changes. */
  onUser(listener: (user: CloudUser | null) => void): Unsubscribe;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** With a Google ID token the shell got itself, or (null) in a popup. */
  signInWithGoogle(idToken: string | null): Promise<void>;
  signOut(): Promise<void>;
  /** The account's epoch; null when it has none yet. */
  account(uid: string): Promise<number | null>;
  /** Starts the account on its first epoch. */
  createAccount(uid: string): Promise<number>;
  /** The account's epoch as it changes (null: deleted). */
  watchAccount(uid: string, listener: (epoch: number | null) => void): Unsubscribe;
  /** Whether the cloud holds any of the account's data. */
  hasData(uid: string): Promise<boolean>;
  /** The account's documents written after `cursor` (all of them for null), as they come. */
  listen(
    uid: string,
    cursor: string | null,
    onBatch: (batch: CloudBatch) => void,
    onError: (error: unknown) => void
  ): Unsubscribe;
  /** Writes `docs` (null JSON deletes), resolving once the server has them. */
  write(uid: string, docs: OutgoingDoc[], meta: WriteMeta): Promise<void>;
  /** Moves the account to the next epoch and deletes its documents; the new epoch. */
  deleteAll(uid: string, epoch: number): Promise<number>;
}
