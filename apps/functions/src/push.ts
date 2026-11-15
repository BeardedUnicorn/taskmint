/**
 * Telling a user's phones that their published widgets changed
 * (docs/contracts/widgets.md): a phone with TaskMint closed reads them again
 * at once, instead of at its next quarter-hour check (WidgetSync.kt).
 *
 * Each phone keeps its push address (its Firebase installation ID) in
 * `users/{uid}/devices/{deviceId}`. A
 * write to the published widgets sends every other device a message with no
 * content of its own ("read them again"): the figures stay in Firestore,
 * behind the user's sign-in. It's urgent only when the live timer changed
 * (started, paused, stopped, another task): that's what the phone's
 * notification and widget show at once, and Android puts off an app's urgent
 * messages when they come too often with nothing to show for them.
 *
 * An address the phone hasn't written again in two months, or one the push
 * service no longer knows, is forgotten.
 */

/** The published widgets, as far as this reads them. */
export interface PublishedWidgets {
  /** The device that wrote them: it has them already. */
  deviceId: string;
  /** The figures (WidgetSnapshot, as JSON). */
  json: string;
}

/** A phone's push address (firebase/firestore.rules: devices). */
export interface Device {
  /** The phone's sync device id: the document's name. */
  id: string;
  /** The phone's Firebase installation ID, which Cloud Messaging sends to. */
  fid: string;
  /** When the phone last wrote it. */
  updatedAtMs: number;
}

export interface Push {
  fid: string;
  priority: 'high' | 'normal';
}

/** A phone writes its address again every week (WidgetSync.kt); one this old is gone. */
export const STALE_AFTER_MS = 60 * 24 * 60 * 60_000;

/** The live timer in `doc`, as text to compare; "null" for none, or for figures that don't read. */
function timerOf(doc: PublishedWidgets | null): string {
  if (doc === null) return 'null';
  try {
    return JSON.stringify((JSON.parse(doc.json) as { timer?: unknown }).timer ?? null);
  } catch {
    return 'null';
  }
}

/** Who to tell that the widgets went from `before` to `after`, and which addresses to forget. */
export function plan(
  before: PublishedWidgets | null,
  after: PublishedWidgets | null,
  devices: Device[],
  nowMs: number
): { pushes: (Push & { id: string })[]; stale: string[] } {
  const stale = devices.filter(device => nowMs - device.updatedAtMs > STALE_AFTER_MS).map(device => device.id);
  // Deleted (with the cloud data): nothing to read
  if (after === null) return { pushes: [], stale };
  const priority = timerOf(before) === timerOf(after) ? 'normal' : 'high';
  const pushes = devices
    .filter(device => device.id !== after.deviceId && !stale.includes(device.id))
    .map(device => ({ id: device.id, fid: device.fid, priority }) as const);
  return { pushes, stale };
}

/** What the function needs of Firebase (index.ts gives the real ones). */
export interface PushDeps {
  devices(uid: string): Promise<Device[]>;
  send(push: Push): Promise<void>;
  forget(uid: string, deviceId: string): Promise<void>;
  now(): number;
  /** Whether a failed send means the address is gone for good. */
  isGone(error: unknown): boolean;
  warn(message: string, error: unknown): void;
}

/** The published widgets of `uid` changed: tells its other phones; how many were told and forgotten. */
export async function notifyDevices(
  uid: string,
  before: PublishedWidgets | null,
  after: PublishedWidgets | null,
  deps: PushDeps
): Promise<{ sent: number; forgotten: number }> {
  const { pushes, stale } = plan(before, after, await deps.devices(uid), deps.now());
  const gone = [...stale];
  let sent = 0;
  await Promise.all(
    pushes.map(async ({ id, fid, priority }) => {
      try {
        await deps.send({ fid, priority });
        sent += 1;
      } catch (error) {
        if (deps.isGone(error)) gone.push(id);
        else deps.warn(`Couldn't tell device ${id}`, error);
      }
    })
  );
  await Promise.all(gone.map(id => deps.forget(uid, id)));
  return { sent, forgotten: gone.length };
}
