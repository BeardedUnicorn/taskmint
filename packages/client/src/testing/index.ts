/**
 * Test support for the client and the shells that embed it
 * (`@taskmint/client/testing`).
 */

import { onTestFinished } from 'vitest';
import { setBackend } from '../backend/registry';
import type { Backend } from '../backend/types';
import { resetAppRecordsForTests } from '../services/appRecords';
import { createFakeBackend, type FakeBackend, type FakeBackendOptions } from './fakeBackend';

export { createFakeBackend };
export type { FakeBackend, FakeBackendOptions, FakePlatform } from './fakeBackend';

let installed: FakeBackend | null = null;

/** The fake as the Backend it stands in for (its mocks take any command). */
export function asBackend(fake: FakeBackend): Backend {
  return fake as unknown as Backend;
}

/** Makes a new fake the page's backend and returns it. */
export function installFakeBackend(options?: FakeBackendOptions): FakeBackend {
  installed = createFakeBackend(options);
  setBackend(asBackend(installed));
  return installed;
}

/**
 * A fake with these options as the backend for the current test only (say,
 * one without idle detection); the one before it comes back afterwards.
 */
export function installFakeBackendForTest(options: FakeBackendOptions): FakeBackend {
  const previous = fakeBackend();
  onTestFinished(() => {
    installed = previous;
    setBackend(asBackend(previous));
  });
  return installFakeBackend(options);
}

/** The fake installFakeBackend last installed (the test setup installs one per file). */
export function fakeBackend(): FakeBackend {
  if (!installed) throw new Error('No fake backend: call installFakeBackend first');
  return installed;
}

/** The app records as if just loaded from the backend (the test setup starts each test with none). */
export function seedAppRecords(records: Record<string, unknown>): void {
  resetAppRecordsForTests(records);
}
