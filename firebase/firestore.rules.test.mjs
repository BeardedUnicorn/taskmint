// The Firestore security rules (firestore.rules), on the emulator:
// scripts/test-rules.sh starts it and runs this file. TaskMint's sync, what
// it publishes for other apps, and BudgetMint's data.

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
  // bea's account, on its first epoch, in TaskMint and BudgetMint
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/bea'), { epoch: 1 });
    await setDoc(doc(context.firestore(), 'budgetmint/bea'), { epoch: 1 });
  });
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

/** The payout forecast as TaskMint publishes it. */
function forecast(changes = {}) {
  return {
    schema: 1,
    json: '{"schema":1}',
    hash: '0123456789abcdef',
    deviceId: 'desk',
    appVersion: '4.2.0',
    epoch: 1,
    updatedAt: serverTimestamp(),
    ...changes,
  };
}

const FORECAST = 'users/bea/published/payoutForecast';

describe('the published payout forecast', () => {
  it('is written, read and deleted by its owner only', async () => {
    await assertSucceeds(setDoc(doc(bea(), FORECAST), forecast()));
    await assertSucceeds(getDoc(doc(bea(), FORECAST)));
    await assertFails(getDoc(doc(cal(), FORECAST)));
    await assertFails(getDoc(doc(nobody(), FORECAST)));
    await assertFails(setDoc(doc(cal(), FORECAST), forecast()));
    await assertFails(deleteDoc(doc(cal(), FORECAST)));
    await assertSucceeds(deleteDoc(doc(bea(), FORECAST)));
  });

  it('is the only thing published', async () => {
    await assertFails(setDoc(doc(bea(), 'users/bea/published/somethingElse'), forecast()));
  });

  it('is refused from an earlier epoch, or without an account', async () => {
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users/bea'), { epoch: 2 }));
    await assertFails(setDoc(doc(bea(), FORECAST), forecast()));
    await assertSucceeds(setDoc(doc(bea(), FORECAST), forecast({ epoch: 2 })));
    await assertFails(setDoc(doc(cal(), 'users/cal/published/payoutForecast'), forecast()));
  });

  it('can’t go back to an older contract', async () => {
    await assertSucceeds(setDoc(doc(bea(), FORECAST), forecast({ schema: 2 })));
    await assertFails(setDoc(doc(bea(), FORECAST), forecast({ schema: 1 })));
    await assertSucceeds(setDoc(doc(bea(), FORECAST), forecast({ schema: 3 })));
  });

  it('holds only what TaskMint publishes, as it publishes it', async () => {
    const refused = [
      forecast({ extra: 1 }),
      forecast({ schema: 0 }),
      forecast({ schema: '1' }),
      forecast({ json: 42 }),
      forecast({ json: 'x'.repeat(200001) }),
      forecast({ hash: 'x'.repeat(33) }),
      forecast({ deviceId: 'x'.repeat(65) }),
      forecast({ appVersion: 4 }),
      forecast({ appVersion: 'x'.repeat(33) }),
      forecast({ updatedAt: Timestamp.fromMillis(0) }),
    ];
    for (const data of refused) {
      await assertFails(setDoc(doc(bea(), FORECAST), data));
    }
    const { appVersion: _, ...missing } = forecast();
    await assertFails(setDoc(doc(bea(), FORECAST), missing));
    await assertSucceeds(setDoc(doc(bea(), FORECAST), forecast({ json: 'x'.repeat(200000) })));
  });
});

/** A BudgetMint document as BudgetMint writes it. */
function budget(changes = {}) {
  return {
    kind: 'item',
    json: '{"id":"rent"}',
    schema: 1,
    deviceId: 'desk',
    epoch: 1,
    updatedAt: serverTimestamp(),
    ...changes,
  };
}

const ITEM = 'budgetmint/bea/data/item~2f1c6a0e-4b7d-4a8e-9a51-0f6f3c2b9d10';

describe('BudgetMint’s account document', () => {
  it('is its owner’s alone, starts on epoch 1 and moves on one at a time', async () => {
    await assertSucceeds(getDoc(doc(bea(), 'budgetmint/bea')));
    await assertFails(getDoc(doc(cal(), 'budgetmint/bea')));
    await assertFails(getDoc(doc(nobody(), 'budgetmint/bea')));
    await assertFails(setDoc(doc(cal(), 'budgetmint/bea'), { epoch: 2 }));
    await assertFails(setDoc(doc(cal(), 'budgetmint/cal'), { epoch: 2 }));
    await assertFails(setDoc(doc(cal(), 'budgetmint/cal'), { epoch: 1, admin: true }));
    await assertSucceeds(setDoc(doc(cal(), 'budgetmint/cal'), { epoch: 1 }));
    await assertFails(updateDoc(doc(bea(), 'budgetmint/bea'), { epoch: 3 }));
    await assertSucceeds(updateDoc(doc(bea(), 'budgetmint/bea'), { epoch: 2 }));
    await assertFails(updateDoc(doc(bea(), 'budgetmint/bea'), { epoch: 3, admin: true }));
    await assertSucceeds(deleteDoc(doc(bea(), 'budgetmint/bea')));
  });
});

describe('BudgetMint’s data documents', () => {
  it('are written, read and deleted by their owner only', async () => {
    await assertSucceeds(setDoc(doc(bea(), ITEM), budget()));
    await assertSucceeds(getDoc(doc(bea(), ITEM)));
    await assertFails(getDoc(doc(cal(), ITEM)));
    await assertFails(getDoc(doc(nobody(), ITEM)));
    await assertFails(setDoc(doc(cal(), ITEM), budget()));
    await assertFails(deleteDoc(doc(cal(), ITEM)));
    await assertSucceeds(deleteDoc(doc(bea(), ITEM)));
  });

  it('are refused from an earlier epoch, or without an account', async () => {
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'budgetmint/bea'), { epoch: 2 }));
    await assertFails(setDoc(doc(bea(), ITEM), budget()));
    await assertSucceeds(setDoc(doc(bea(), ITEM), budget({ epoch: 2 })));
    await assertFails(setDoc(doc(cal(), 'budgetmint/cal/data/item~rent'), budget()));
  });

  it('have each kind’s ids and sizes', async () => {
    const allowed = [
      ['budgetmint/bea/data/settings~account', budget({ kind: 'settings', json: 'x'.repeat(20000) })],
      [ITEM, budget({ json: 'x'.repeat(50000) })],
      ['budgetmint/bea/data/occ~2026-11-30~rent-1', budget({ kind: 'occ', json: 'x'.repeat(4000) })],
    ];
    for (const [path, data] of allowed) {
      await assertSucceeds(setDoc(doc(bea(), path), data));
    }
    const refused = [
      ['budgetmint/bea/data/settings~device', budget({ kind: 'settings' })],
      ['budgetmint/bea/data/settings~account', budget({ kind: 'settings', json: 'x'.repeat(20001) })],
      [ITEM, budget({ json: 'x'.repeat(50001) })],
      ['budgetmint/bea/data/item~', budget()],
      ['budgetmint/bea/data/item~a b', budget()],
      [`budgetmint/bea/data/item~${'a'.repeat(65)}`, budget()],
      ['budgetmint/bea/data/occ~2026-11-30~rent-1', budget({ kind: 'occ', json: 'x'.repeat(4001) })],
      ['budgetmint/bea/data/occ~2026-11~rent-1', budget({ kind: 'occ' })],
      ['budgetmint/bea/data/occ~2026-11-30', budget({ kind: 'occ' })],
      // A kind under another kind's id
      ['budgetmint/bea/data/item~rent', budget({ kind: 'occ' })],
      ['budgetmint/bea/data/secret~x', budget({ kind: 'secret' })],
    ];
    for (const [path, data] of refused) {
      await assertFails(setDoc(doc(bea(), path), data));
    }
  });

  it('hold only what BudgetMint writes, as it writes it', async () => {
    const refused = [
      budget({ extra: 1 }),
      budget({ kind: 7 }),
      budget({ json: 42 }),
      budget({ schema: 0 }),
      budget({ schema: '1' }),
      budget({ deviceId: 'x'.repeat(65) }),
      budget({ updatedAt: Timestamp.fromMillis(0) }),
    ];
    for (const data of refused) {
      await assertFails(setDoc(doc(bea(), ITEM), data));
    }
    const { deviceId: _, ...missing } = budget();
    await assertFails(setDoc(doc(bea(), ITEM), missing));
  });

  it('can’t go back to an older schema', async () => {
    await assertSucceeds(setDoc(doc(bea(), ITEM), budget({ schema: 2 })));
    await assertFails(setDoc(doc(bea(), ITEM), budget({ schema: 1 })));
  });

  it('can’t be written under TaskMint’s data, nor TaskMint’s under them', async () => {
    await assertFails(setDoc(doc(bea(), 'users/bea/data/item~rent'), budget()));
    await assertFails(setDoc(doc(bea(), 'budgetmint/bea/data/session~s1'), session()));
  });
});
