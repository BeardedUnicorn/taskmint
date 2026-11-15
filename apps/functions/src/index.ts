/**
 * The Cloud Function TaskMint deploys (firebase.json → dist, built by
 * build.mjs): a write to a user's published widgets tells their phones
 * (push.ts has what it decides; this only registers it and calls Firebase).
 *
 * It runs as the function's own service account, which reads the phones'
 * push addresses and sends through Firebase Cloud Messaging; the security
 * rules don't apply to it. The message carries no data of the user's.
 */

import { initializeApp } from 'firebase-admin/app';
import { type DocumentSnapshot, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { notifyDevices, type PublishedWidgets } from './push';

initializeApp();

const widgetsOf = (snapshot: DocumentSnapshot | undefined): PublishedWidgets | null =>
  snapshot?.exists ? { deviceId: String(snapshot.get('deviceId')), json: String(snapshot.get('json')) } : null;

/** The push service's words for an address that will never work again. */
const GONE = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

export const widgetsPublished = onDocumentWritten(
  // nam5's functions run in us-central1; a few at once is plenty for one user's devices
  { document: 'users/{uid}/published/widgets', region: 'us-central1', maxInstances: 3, memory: '256MiB' },
  async event => {
    const { uid } = event.params;
    const devices = getFirestore().collection(`users/${uid}/devices`);
    const result = await notifyDevices(uid, widgetsOf(event.data?.before), widgetsOf(event.data?.after), {
      devices: async () =>
        (await devices.get()).docs.map(doc => ({
          id: doc.id,
          fid: String(doc.get('fid')),
          updatedAtMs: doc.get('updatedAt')?.toMillis() ?? 0,
        })),
      send: async ({ fid, priority }) => {
        await getMessaging().send({
          fid,
          data: { kind: 'widgets' },
          // One waiting message is enough: a later one replaces it
          android: { priority, collapseKey: 'widgets', ttl: 60 * 60_000 },
        });
      },
      forget: async (_uid, deviceId) => {
        await devices.doc(deviceId).delete();
      },
      now: () => Date.now(),
      isGone: error => GONE.has((error as { code?: string }).code ?? ''),
      warn: (message, error) => logger.warn(message, error),
    });
    logger.info('Published widgets changed', result);
  }
);
