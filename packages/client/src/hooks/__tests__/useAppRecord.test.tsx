import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNode } from 'react';
import { useAppRecord } from '../useAppRecord';
import { useDailyGoals } from '../useDailyGoals';
import { DailyGoalProvider } from '../../contexts/DailyGoalContext';
import { loadAppRecords, readAppRecord, resetAppRecordsForTests } from '../../services/appRecords';
import { fakeBackend } from '../../testing';

const mockInvoke = fakeBackend().call;

async function loadWith(records: Record<string, unknown>) {
  mockInvoke.mockImplementation(async (command: string) =>
    command === 'get_app_records' ? { records, revisions: {} } : null
  );
  await loadAppRecords({ importLegacy: false });
}

describe('useAppRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppRecordsForTests();
    window.localStorage.clear();
  });

  it('reads the app record and saves updates to it', async () => {
    await loadWith({ dailyGoalAchievements: [{ id: 'a' }] });
    const { result } = renderHook(() => useAppRecord<{ id: string }[]>('dailyGoalAchievements', []));

    expect(result.current[0]).toEqual([{ id: 'a' }]);

    // Two functional updates in a row each build on the one before
    act(() => {
      result.current[1](prev => [...prev, { id: 'b' }]);
      result.current[1](prev => [...prev, { id: 'c' }]);
    });

    expect(result.current[0]).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenLastCalledWith('set_app_record', {
        key: 'dailyGoalAchievements',
        value: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        // Each save builds on the one before
        baseRevision: 1,
      })
    );
    expect(window.localStorage.getItem('dailyGoalAchievements')).toBeNull();
  });

  it('starts from the initial value when there is no record', async () => {
    await loadWith({});
    const { result } = renderHook(() => useAppRecord<{ targetAmount: number } | null>('dailyGoal', null));

    expect(result.current[0]).toBeNull();
  });

  it('keeps the new value and logs when the save fails', async () => {
    await loadWith({});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke.mockRejectedValueOnce('disk full');
    const { result } = renderHook(() => useAppRecord<{ targetAmount: number } | null>('dailyGoal', null));

    act(() => result.current[1]({ targetAmount: 9 }));

    expect(result.current[0]).toEqual({ targetAmount: 9 });
    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to save "dailyGoal":', 'disk full'));
    error.mockRestore();
  });

  it('keeps the daily goal in the app records', async () => {
    await loadWith({});
    const wrapper = ({ children }: { children: ReactNode }) => <DailyGoalProvider>{children}</DailyGoalProvider>;
    const { result } = renderHook(() => useDailyGoals(), { wrapper });

    await act(async () => {
      await result.current.updateDailyGoal({ targetAmount: 150, isEnabled: true });
    });

    expect(readAppRecord('dailyGoal')).toMatchObject({ targetAmount: 150, isEnabled: true });
    expect(mockInvoke).toHaveBeenCalledWith('set_app_record', expect.objectContaining({ key: 'dailyGoal' }));
    expect(window.localStorage.getItem('dailyGoal')).toBeNull();
  });
});
