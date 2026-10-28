/**
 * A fake clock for the waits only: hashing and gzip are real async work,
 * which a fake clock can't move along, so the clock is advanced in steps
 * with real turns of the event loop in between.
 */

import { expect, vi } from 'vitest';

export function fakeWaits() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

/** Moves the fake clock on until `done`, letting real work run in between. */
export async function passTimeUntil(done: () => boolean): Promise<void> {
  for (let tries = 0; !done(); tries++) {
    expect(tries).toBeLessThan(1000);
    await vi.advanceTimersByTimeAsync(500);
    await new Promise(resolve => setImmediate(resolve));
  }
}

/** Runs `work` while the fake clock passes its waits. */
export async function withTimePassing<T>(work: Promise<T>): Promise<T> {
  let settled = false;
  work.then(
    () => (settled = true),
    () => (settled = true),
  );
  await passTimeUntil(() => settled);
  return work;
}
