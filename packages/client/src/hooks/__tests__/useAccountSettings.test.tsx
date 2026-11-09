import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readAppRecord } from '../../services/appRecords';
import { announceAppRecordsChange, fakeBackend, seedAppRecords } from '../../testing';
import { readAccountSettings, updateAccountSettings, useAccountSettings } from '../useAccountSettings';
import { useFundsReleaseSettings } from '../useFundsReleaseSettings';
import { useWithdrawalIntervalSetting } from '../useWithdrawalIntervalSetting';

describe('useAccountSettings', () => {
  it('starts at the defaults, and every reader sees a save at once', async () => {
    const first = renderHook(() => useAccountSettings());
    const second = renderHook(() => useWithdrawalIntervalSetting());
    expect(first.result.current[0]).toEqual({ fundsReleaseDays: 7, withdrawalIntervalDays: 3 });

    await act(() => second.result.current.updateDays(5));

    expect(first.result.current[0]).toEqual({ fundsReleaseDays: 7, withdrawalIntervalDays: 5 });
    // Saved with the data, both settings together
    expect(fakeBackend().call).toHaveBeenCalledWith('set_app_record', {
      key: 'accountSettings',
      value: { fundsReleaseDays: 7, withdrawalIntervalDays: 5 },
      baseRevision: 0,
    });
  });

  it('reads what is stored, a field it refuses as its default', () => {
    seedAppRecords({ accountSettings: { fundsReleaseDays: 2, withdrawalIntervalDays: 'soon' } });
    const { result } = renderHook(() => useFundsReleaseSettings());
    expect(result.current.days).toBe(2);
    expect(readAccountSettings()).toEqual({ fundsReleaseDays: 2, withdrawalIntervalDays: 3 });
    // The same object until the record changes
    expect(readAccountSettings()).toBe(readAccountSettings());
  });

  it('never saves a value it refuses', async () => {
    const { result } = renderHook(() => useFundsReleaseSettings());
    await expect(act(() => result.current.updateDays(-1))).rejects.toMatchObject({
      code: 'STORAGE_VALIDATION_FAILED',
    });
    await expect(updateAccountSettings({ withdrawalIntervalDays: 1.5 })).rejects.toMatchObject({
      code: 'STORAGE_VALIDATION_FAILED',
    });
    expect(result.current.days).toBe(7);
    expect(fakeBackend().call).not.toHaveBeenCalledWith('set_app_record', expect.anything());
  });

  it('goes back to what was saved when a save fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeBackend().call.mockRejectedValueOnce('disk full');
    const { result } = renderHook(() => useFundsReleaseSettings());

    await expect(act(() => result.current.updateDays(3))).rejects.toBe('disk full');

    expect(result.current.days).toBe(7);
    expect(readAppRecord('accountSettings')).toBeUndefined();
  });

  it('follows a change made on another device', () => {
    const { result, unmount } = renderHook(() => useFundsReleaseSettings());

    seedAppRecords({ accountSettings: { fundsReleaseDays: 10, withdrawalIntervalDays: 3 } });
    act(() => announceAppRecordsChange({ keys: ['accountSettings'], conflict: false }));
    expect(result.current.days).toBe(10);

    // Other records' changes don't concern it
    act(() => announceAppRecordsChange({ keys: ['withdrawals'], conflict: false }));
    expect(result.current.days).toBe(10);
    unmount();
  });
});
