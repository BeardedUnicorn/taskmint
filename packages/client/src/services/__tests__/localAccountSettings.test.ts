import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORE_ERRORS } from '@taskmint/contracts';
import { moveLocalAccountSettings } from '../localAccountSettings';
import { readAppRecord } from '../appRecords';
import { fakeBackend, installFakeBackendForTest, seedAppRecords } from '../../testing';

/** As 2.4's device setting saved it. */
const keep = (key: string, value: unknown) =>
  window.localStorage.setItem(key, JSON.stringify({ version: 1, data: value, migratedAt: '2026-11-01T00:00:00Z' }));
const left = () => [
  window.localStorage.getItem('fundsReleaseDays'),
  window.localStorage.getItem('withdrawalIntervalDays'),
];

describe("moving this device's payout settings into their record", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    // As in the installed app
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('saves them as the record once, a value it cannot read as its default, and removes them here', async () => {
    keep('fundsReleaseDays', 5);
    keep('withdrawalIntervalDays', 'soon');

    await moveLocalAccountSettings();

    expect(fakeBackend().call).toHaveBeenCalledWith('set_app_record', {
      key: 'accountSettings',
      value: { fundsReleaseDays: 5, withdrawalIntervalDays: 3 },
      baseRevision: 0,
    });
    expect(readAppRecord('accountSettings')).toEqual({ fundsReleaseDays: 5, withdrawalIntervalDays: 3 });
    expect(left()).toEqual([null, null]);

    // Nothing left to move
    vi.clearAllMocks();
    await moveLocalAccountSettings();
    expect(fakeBackend().call).not.toHaveBeenCalled();
  });

  it('gives way to a record that is set already, or set elsewhere meanwhile', async () => {
    seedAppRecords({ accountSettings: { fundsReleaseDays: 7, withdrawalIntervalDays: 4 } });
    keep('withdrawalIntervalDays', 1);
    await moveLocalAccountSettings();
    expect(fakeBackend().call).not.toHaveBeenCalled();
    expect(left()).toEqual([null, null]);

    seedAppRecords({});
    keep('fundsReleaseDays', 2);
    fakeBackend().call.mockImplementation(async (command: string) => {
      if (command === 'set_app_record') throw CORE_ERRORS.RECORD_CONFLICT;
      return { records: { accountSettings: { fundsReleaseDays: 9, withdrawalIntervalDays: 3 } }, revisions: {} };
    });
    await moveLocalAccountSettings();
    expect(left()).toEqual([null, null]);
  });

  it('keeps them for the next launch when the save fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    keep('fundsReleaseDays', 2);
    fakeBackend().call.mockRejectedValueOnce('disk full');

    await moveLocalAccountSettings();

    expect(error).toHaveBeenCalledWith('Failed to move the payout settings into their record:', 'disk full');
    expect(readAppRecord('accountSettings')).toBeUndefined();
    expect(left()[0]).not.toBeNull();
  });

  it('leaves them in a development build, and on a desktop using a server', async () => {
    keep('fundsReleaseDays', 2);
    vi.stubEnv('DEV', true);
    await moveLocalAccountSettings();
    vi.stubEnv('DEV', false);
    installFakeBackendForTest({ capabilities: { dataLocation: 'server' } });
    await moveLocalAccountSettings();

    expect(left()[0]).not.toBeNull();
    expect(readAppRecord('accountSettings')).toBeUndefined();
  });

  it("moves the web app's own into the account's record", async () => {
    installFakeBackendForTest({ capabilities: { runtime: 'web', dataLocation: 'server' } });
    keep('withdrawalIntervalDays', 4);

    await moveLocalAccountSettings();

    expect(readAppRecord('accountSettings')).toEqual({ fundsReleaseDays: 7, withdrawalIntervalDays: 4 });
  });
});
