/**
 * Global Mocks
 *
 * Every test file gets a fake backend (see src/testing), so tests that don't
 * care about the backend can render without one; a test that does reads it
 * with fakeBackend(). Each test starts with the app records loaded and empty,
 * as localStorage starts empty.
 */
import { beforeEach } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { installFakeBackend, seedAppRecords } from '../../testing';

// Production code extends dayjs with utc (utils/dateHelpers); do it here too
// so a module under test doesn't depend on dateHelpers being imported first.
// Not `timezone`: the app never loads it (see dateHelpers).
dayjs.extend(utc);

installFakeBackend();

beforeEach(() => {
  seedAppRecords({});
});
