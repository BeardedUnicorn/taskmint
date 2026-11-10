// The Firestore security rules (firestore.rules), on the emulator:
// scripts/test-rules.sh starts it and runs this file.

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, setLogLevel, Timestamp, updateDoc } from 'firebase/firestore';

let env;

before(async () => {
  // The refused writes are the point; their warnings aren't
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-taskmint',
    firestore: {
      rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8085,
    },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  // bea's account, on its first epoch
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users/bea'), { epoch: 1 }));
});

const bea = () => env.authenticatedContext('bea').firestore();
const cal = () => env.authenticatedContext('cal').firestore();
const nobody = () => env.unauthenticatedContext().firestore();

/** A session document as the sync engine writes it. */
function session(changes = {}) {
  return {
    kind: 'session',
    id: 's1',
    json: '{"id":"s1"}',
    hash: '0123456789abcdef',
    deleted: false,
    deviceId: 'desk',
    schema: 1,
    epoch: 1,
    updatedAt: serverTimestamp(),
    ...changes,
  };
}

describe('the account document', () => {
  it('is its owner’s alone', async () => {
    await assertSucceeds(getDoc(doc(bea(), 'users/bea')));
    await assertFails(getDoc(doc(cal(), 'users/bea')));
    await assertFails(getDoc(doc(nobody(), 'users/bea')));
    await assertFails(setDoc(doc(cal(), 'users/bea'), { epoch: 2 }));
  });

  it('starts on epoch 1, holding nothing else', async () => {
    await assertSucceeds(setDoc(doc(cal(), 'users/cal'), { epoch: 1 }));
    await env.clearFirestore();
    await assertFails(setDoc(doc(cal(), 'users/cal'), { epoch: 5 }));
    await assertFails(setDoc(doc(cal(), 'users/cal'), { epoch: 1, admin: true }));
  });

  it('moves on one epoch at a time, and can be deleted', async () => {
    await assertFails(updateDoc(doc(bea(), 'users/bea'), { epoch: 3 }));
    await assertFails(updateDoc(doc(bea(), 'users/bea'), { epoch: 0 }));
    await assertSucceeds(updateDoc(doc(bea(), 'users/bea'), { epoch: 2 }));
    await assertFails(updateDoc(doc(bea(), 'users/bea'), { epoch: 3, admin: true }));
    await assertSucceeds(deleteDoc(doc(bea(), 'users/bea')));
  });
});

describe('the data documents', () => {
  it('are written, read and deleted by their owner only', async () => {
    await assertSucceeds(setDoc(doc(bea(), 'users/bea/data/session~s1'), session()));
    await assertSucceeds(getDoc(doc(bea(), 'users/bea/data/session~s1')));
    await assertFails(getDoc(doc(cal(), 'users/bea/data/session~s1')));
    await assertFails(getDoc(doc(nobody(), 'users/bea/data/session~s1')));
    await assertFails(setDoc(doc(cal(), 'users/bea/data/session~s1'), session()));
    await assertFails(deleteDoc(doc(cal(), 'users/bea/data/session~s1')));
    await assertSucceeds(deleteDoc(doc(bea(), 'users/bea/data/session~s1')));
  });

  it('take a deletion as a tombstone', async () => {
    const tombstone = session({ json: null, hash: '', deleted: true });
    await assertSucceeds(setDoc(doc(bea(), 'users/bea/data/session~s1'), tombstone));
    await assertFails(setDoc(doc(bea(), 'users/bea/data/session~s1'), { ...tombstone, json: '{}' }));
    await assertFails(setDoc(doc(bea(), 'users/bea/data/session~s1'), { ...tombstone, hash: 'x' }));
    await assertFails(setDoc(doc(bea(), 'users/bea/data/session~s1'), session({ json: null })));
  });

  it('are refused from an earlier epoch, or without an account', async () => {
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users/bea'), { epoch: 2 }));
    await assertFails(setDoc(doc(bea(), 'users/bea/data/session~s1'), session()));
    await assertSucceeds(setDoc(doc(bea(), 'users/bea/data/session~s1'), session({ epoch: 2 })));
    await assertFails(setDoc(doc(cal(), 'users/cal/data/session~s1'), session()));
  });

  it('hold only what the sync engine writes, as it writes it', async () => {
    const refused = [
      session({ kind: 'secret' }),
      session({ kind: 'worklog' }),
      session({ extra: 1 }),
      session({ id: 7 }),
      session({ id: 'x'.repeat(1001) }),
      session({ deleted: 'no' }),
      session({ json: 42 }),
      session({ json: 'x'.repeat(900001) }),
      session({ hash: 'x'.repeat(33) }),
      session({ deviceId: 'x'.repeat(65) }),
      session({ schema: 0 }),
      session({ schema: '1' }),
      session({ updatedAt: Timestamp.fromMillis(0) }),
    ];
    for (const data of refused) {
      await assertFails(setDoc(doc(bea(), 'users/bea/data/session~s1'), data));
    }
    const { kind: _, ...missing } = session();
    await assertFails(setDoc(doc(bea(), 'users/bea/data/session~s1'), missing));
    await assertFails(setDoc(doc(bea(), 'users/bea/data/session~'), session()));
    await assertSucceeds(
      setDoc(doc(bea(), 'users/bea/data/record~dailyGoal'), session({ kind: 'record', id: 'dailyGoal' }))
    );
  });
});
