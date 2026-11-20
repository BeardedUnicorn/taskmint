/**
 * The widgets' figures as TaskMint publishes them through cloud sync:
 * `users/{uid}/published/widgets`, the same snapshot the phone's widgets
 * show (widgetSnapshot), so a phone with TaskMint closed can read it and
 * show a timer started on another device. The contract is
 * docs/contracts/widgets.md.
 *
 * It leaves out the snapshot's time: the reader takes the document's write
 * time, so the same figures are the same bytes (and hash) and aren't written
 * twice. While a timer runs the text changes about once a minute (money and
 * time grow), which the phone doesn't need: its clock counts the timer from
 * where the snapshot says. So a running timer's figures go out when the timer,
 * the day or the next withdrawal changes, and otherwise at most every
 * `PUBLISH_EVERY_MS`.
 */

import type { WidgetSnapshot } from '../backend/types';
import type { PublishedDoc } from '../cloud/types';
import { APP_VERSION } from '../utils/appVersion';
import { fnv1a64 } from '../utils/fnv';

/** The rules refuse a larger one (firebase/firestore.rules). */
export const MAX_WIDGETS_JSON = 200_000;
/** How often a running timer's growing figures are published. */
export const PUBLISH_EVERY_MS = 15 * 60_000;

type Snapshot = Omit<WidgetSnapshot, 'updatedAtMs'>;

/**
 * The snapshot as the document cloud sync publishes, its days in `zone`
 * (this device's); null when it's too large for the rules (it never should
 * be: the agenda and the chart are a few weeks).
 */
export function publishedWidgets(snapshot: Snapshot, zone: string): PublishedDoc | null {
  const json = JSON.stringify({ ...snapshot, zone });
  if (json.length > MAX_WIDGETS_JSON) return null;
  return { json, hash: fnv1a64(json), schema: snapshot.version, appVersion: APP_VERSION };
}

/** What was last published: which timer and day, the whole text, and when. */
export interface PublishedMark {
  timer: string;
  text: string;
  atMs: number;
}

/**
 * The day, the live timer and the next withdrawal (how much, when it opens):
 * a change in any is published at once. A withdrawal recorded while a timer
 * runs changes the last, and a phone shouldn't show the old one for long.
 */
const timerKey = (snapshot: Snapshot) => {
  const { payouts } = snapshot;
  return JSON.stringify([snapshot.day, snapshot.timer, payouts && [payouts.label, payouts.amount, payouts.status]]);
};

/**
 * The mark to publish `snapshot` under now, or null when it can wait: the
 * same text as last time, or only a running timer's figures growing, sent
 * less than `PUBLISH_EVERY_MS` ago.
 */
export function widgetsDue(last: PublishedMark | null, snapshot: Snapshot, nowMs: number): PublishedMark | null {
  const text = JSON.stringify(snapshot);
  const mark = { timer: timerKey(snapshot), text, atMs: nowMs };
  if (last === null) return mark;
  if (text === last.text) return null;
  const running = snapshot.timer !== null && snapshot.timer.countingFromMs !== null;
  if (!running || mark.timer !== last.timer) return mark;
  return nowMs - last.atMs >= PUBLISH_EVERY_MS ? mark : null;
}
