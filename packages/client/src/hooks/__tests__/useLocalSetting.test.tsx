import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { writeLocal } from '../../utils/localStore';
import { useWithdrawalIntervalSetting } from '../useWithdrawalIntervalSetting';

describe('useWithdrawalIntervalSetting', () => {
  it('starts at three days, and every reader sees a change at once', async () => {
    localStorage.clear();
    const first = renderHook(() => useWithdrawalIntervalSetting());
    const second = renderHook(() => useWithdrawalIntervalSetting());
    expect(first.result.current.days).toBe(3);

    await act(() => first.result.current.updateDays(5));
    expect(second.result.current.days).toBe(5);
  });

  it('reads a stored value it refuses as the default, and never saves one', async () => {
    localStorage.clear();
    writeLocal('withdrawalIntervalDays', 'soon', null);
    const { result } = renderHook(() => useWithdrawalIntervalSetting());
    expect(result.current.days).toBe(3);

    await expect(act(() => result.current.updateDays(1.5))).rejects.toMatchObject({
      code: 'STORAGE_VALIDATION_FAILED',
    });
    expect(result.current.days).toBe(3);
  });
});
