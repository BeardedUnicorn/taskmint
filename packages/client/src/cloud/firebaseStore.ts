/**
 * The CloudStore on Firebase's JavaScript SDK, loaded only when sync starts
 * (it's a large part of the bundle). Sign-in keeps the session in the
 * webview's IndexedDB (falling back to localStorage where a webview has no
 * IndexedDB for its origin); the desktop and phone apps pass no popup
 * resolver, so nothing loads Google's sign-in iframe there.
 */

import type { OutgoingDoc } from '@taskmint/contracts';
import type { CloudBatch, CloudConfig, CloudDoc, CloudStore, CloudUser, WriteMeta } from './types';

/** Firestore takes at most 500 writes in a batch. */
export const BATCH_SIZE = 400;

type Firestore = typeof import('firebase/firestore');
type Timestamp = InstanceType<Firestore['Timestamp']>;

/** A server timestamp as a cursor that sorts as text: "seconds.nanoseconds", zero-padded. */
export function cursorOf(time: Timestamp): string {
  return `${String(time.seconds).padStart(12, '0')}.${String(time.nanoseconds).padStart(9, '0')}`;
}

export async function createFirebaseStore(config: CloudConfig): Promise<CloudStore> {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  const app = initializeApp(config.firebase);
  const session = auth.initializeAuth(app, {
    persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence],
    ...(config.popupSignIn ? { popupRedirectResolver: auth.browserPopupRedirectResolver } : {}),
  });
  const db = fs.initializeFirestore(app, {
    localCache: config.persistentCache
      ? fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
      : fs.memoryLocalCache(),
  });
  if (config.emulatorHost) {
    auth.connectAuthEmulator(session, `http://${config.emulatorHost}:9099`, { disableWarnings: true });
    fs.connectFirestoreEmulator(db, config.emulatorHost, 8085);
  }

  const accountDoc = (uid: string) => fs.doc(db, 'users', uid);
  const data = (uid: string) => fs.collection(db, 'users', uid, 'data');
  const epochOf = (snapshot: { exists(): boolean; get(field: string): unknown }) =>
    snapshot.exists() ? Number(snapshot.get('epoch')) : null;
  const decode = (cursor: string) => {
    const [seconds, nanoseconds] = cursor.split('.').map(Number);
    return new fs.Timestamp(seconds, nanoseconds);
  };

  return {
    onUser(listener) {
      return auth.onAuthStateChanged(session, user =>
        listener(
          user
            ? ({
                uid: user.uid,
                email: user.email,
                providers: user.providerData.map(provider => provider.providerId),
              } satisfies CloudUser)
            : null
        )
      );
    },
    async signIn(email, password) {
      await auth.signInWithEmailAndPassword(session, email, password);
    },
    async signUp(email, password) {
      await auth.createUserWithEmailAndPassword(session, email, password);
    },
    resetPassword: email => auth.sendPasswordResetEmail(session, email),
    async signInWithGoogle(idToken) {
      await (idToken
        ? auth.signInWithCredential(session, auth.GoogleAuthProvider.credential(idToken))
        : auth.signInWithPopup(session, new auth.GoogleAuthProvider()));
    },
    signOut: () => auth.signOut(session),
    async deleteUser() {
      await auth.deleteUser(session.currentUser!);
    },

    account: async uid => epochOf(await fs.getDoc(accountDoc(uid))),
    async createAccount(uid) {
      await fs.setDoc(accountDoc(uid), { epoch: 1 });
      return 1;
    },
    watchAccount(uid, listener) {
      return fs.onSnapshot(accountDoc(uid), snapshot => {
        // Only the server's word: a cached copy may be from before a reset
        if (!snapshot.metadata.fromCache) listener(epochOf(snapshot));
      });
    },
    async hasData(uid) {
      const live = await fs.getDocs(fs.query(data(uid), fs.where('deleted', '==', false), fs.limit(1)));
      return !live.empty;
    },

    listen(uid, cursor, onBatch, onError) {
      const changed = cursor
        ? fs.query(data(uid), fs.where('updatedAt', '>', decode(cursor)), fs.orderBy('updatedAt'))
        : fs.query(data(uid), fs.orderBy('updatedAt'));
      // The server's first answer counts even with nothing new: sync then
      // knows it has caught up
      let answered = false;
      return fs.onSnapshot(
        changed,
        { includeMetadataChanges: true },
        snapshot => {
          const first = !answered && !snapshot.metadata.fromCache;
          answered ||= first;
          // A write in flight comes back once the server has it, with its time
          const confirmed = snapshot.docs.filter(doc => !doc.metadata.hasPendingWrites);
          const docs: CloudDoc[] = snapshot
            .docChanges()
            .filter(change => change.type !== 'removed' && !change.doc.metadata.hasPendingWrites)
            .map(({ doc }) => ({
              docId: doc.id,
              json: doc.get('deleted') ? null : (doc.get('json') as string),
              schema: Number(doc.get('schema')),
            }));
          const last = confirmed.at(-1);
          const batch: CloudBatch = {
            docs,
            cursor: snapshot.metadata.fromCache || !last ? null : cursorOf(last.get('updatedAt') as Timestamp),
          };
          if (batch.docs.length > 0 || batch.cursor || first) onBatch(batch);
        },
        onError
      );
    },
    async write(uid, docs: OutgoingDoc[], meta: WriteMeta) {
      for (let start = 0; start < docs.length; start += BATCH_SIZE) {
        const batch = fs.writeBatch(db);
        for (const doc of docs.slice(start, start + BATCH_SIZE)) {
          batch.set(fs.doc(data(uid), doc.docId), {
            kind: doc.kind,
            id: doc.id,
            json: doc.json,
            hash: doc.hash,
            deleted: doc.json === null,
            deviceId: meta.deviceId,
            schema: meta.schema,
            epoch: meta.epoch,
            updatedAt: fs.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    },
    async deleteAll(uid, epoch) {
      const next = epoch + 1;
      // Writes from devices still on the old epoch are refused from here on
      await fs.updateDoc(accountDoc(uid), { epoch: next });
      const all = await fs.getDocs(data(uid));
      for (let start = 0; start < all.docs.length; start += BATCH_SIZE) {
        const batch = fs.writeBatch(db);
        for (const doc of all.docs.slice(start, start + BATCH_SIZE)) batch.delete(doc.ref);
        await batch.commit();
      }
      return next;
    },
  };
}
