import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppRecord } from '../useAppRecord';
import { useDailyGoals } from '../useDailyGoals';
import { DailyGoalProvider } from '../../contexts/DailyGoalContext';
import { loadAppRecords, readAppRecord, resetAppRecordsForTests } from '../../services/appRecords';
import { isTauriEnvironment } from '../../utils/tauri';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../utils/tauri', () => ({ isTauriEnvironment: vi.fn(() => true) }));

const mockInvoke = vi.mocked(invoke);

async function loadWith(records: Record<string, unknown>) {
  mockInvoke.mockImplementation(async (command: string) =>
    command === 'get_app_records' ? { records, initialized: true } : null
  );
  await loadAppRecords();
}

describe('useAppRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
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
      })
    );
    expect(window.localStorage.getItem('dailyGoalAchievements')).toBeNull();
  });

  it('is useLocalStorage outside the app', () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(false);
    window.localStorage.setItem('dailyGoal', JSON.stringify({ version: 1, data: { targetAmount: 5 } }));
    const { result } = renderHook(() => useAppRecord<{ targetAmount: number } | null>('dailyGoal', null));

    expect(result.current[0]).toEqual({ targetAmount: 5 });
    act(() => result.current[1]({ targetAmount: 9 }));
    expect(JSON.parse(window.localStorage.getItem('dailyGoal')!).data).toEqual({ targetAmount: 9 });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('keeps the daily goal in the app records', async () => {
    await loadWith({});
    const wrapper = ({ children }: { children: ReactNode }) => <DailyGoalProvider>{children}</DailyGoalProvider>;
    const { result } = renderHook(() => useDailyGoals(), { wrapper });

    await act(async () => {
      await result.current.updateDailyGoal({ targetAmount: 150, isEnabled: true });
    });

    expect(readAppRecord('dailyGoal')).toMatchObject({ targetAmount: 150, isEnabled: true });
    expect(mockInvoke).toHaveBeenCalledWith(
      'set_app_record',
      expect.objectContaining({ key: 'dailyGoal' })
    );
    expect(window.localStorage.getItem('dailyGoal')).toBeNull();
  });
});
