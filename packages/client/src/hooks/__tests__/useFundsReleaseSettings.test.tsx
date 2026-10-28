import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFundsReleaseSettings } from '../useFundsReleaseSettings';

describe('useFundsReleaseSettings', () => {
  it('starts at a week, and keeps the days chosen on this device', async () => {
    const first = renderHook(() => useFundsReleaseSettings());
    expect(first.result.current.days).toBe(7);
    // Its stored value (none yet) has been read
    await act(async () => {});
    await act(() => first.result.current.updateDays(3));
    expect(first.result.current.days).toBe(3);

    const again = renderHook(() => useFundsReleaseSettings());
    await waitFor(() => expect(again.result.current.days).toBe(3));
  });

  it('turns down a number of days that is not one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useFundsReleaseSettings());
    await expect(act(() => result.current.updateDays(-1))).rejects.toMatchObject({ code: 'STORAGE_VALIDATION_FAILED' });
  });
});
