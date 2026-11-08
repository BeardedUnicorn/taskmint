import { describe, expect, it, vi } from 'vitest';
import { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { NotificationProvider } from '../../contexts/NotificationContext';
import { WithdrawalsProvider } from '../../contexts/WithdrawalsContext';
import { PayoutDataProvider } from '../../contexts/PayoutDataContext';
import { seedAppRecords } from '../../testing';
import { createMockWorkLogEntry } from '../../__tests__/setup/session-test-utils';
import { createMockWithdrawal } from '../../__tests__/setup/payout-test-utils';
import { lastImportMs, usePayoutData } from '../usePayoutData';

const contexts = vi.hoisted(() => ({
  sessions: { sessions: [] as unknown[], isLoading: false },
  tasks: { tasks: [] as unknown[], isLoading: false },
  workLogs: { entries: [] as unknown[], isLoading: false },
}));
vi.mock('../../contexts/SessionManagementContext', () => ({ useSessionManagementContext: () => contexts.sessions }));
vi.mock('../../contexts/TaskManagementContext', () => ({ useTaskManagementContext: () => contexts.tasks }));
vi.mock('../../contexts/WorkLogContext', () => ({ useWorkLogContext: () => contexts.workLogs }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NotificationProvider>
    <WithdrawalsProvider>
      <PayoutDataProvider>{children}</PayoutDataProvider>
    </WithdrawalsProvider>
  </NotificationProvider>
);

describe('usePayoutData', () => {
  it('needs its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePayoutData())).toThrow('usePayoutData must be used within a PayoutDataProvider');
  });

  it('plans the next withdrawal from the recorded ones', () => {
    const takenAt = new Date(Date.now() - 86_400_000).toISOString();
    seedAppRecords({ withdrawals: [createMockWithdrawal({ takenAt })] });
    const { result } = renderHook(() => usePayoutData(), { wrapper });
    expect(result.current.withdrawalIntervalDays).toBe(3);
    expect(result.current.plan?.last.takenAt).toBe(takenAt);
    expect(result.current.plan?.opensAtMs).toBe(Date.parse(takenAt) + 3 * 86_400_000);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('is loading while sessions (the first time), tasks or work logs are', () => {
    const loading = (sessions: boolean, tasks: boolean, workLogs: boolean, hasSessions = false) => {
      contexts.sessions = { sessions: hasSessions ? [{}] : [], isLoading: sessions };
      contexts.tasks = { tasks: [], isLoading: tasks };
      contexts.workLogs = { entries: [], isLoading: workLogs };
      return renderHook(() => usePayoutData(), { wrapper }).result.current.isLoading;
    };
    expect(loading(true, false, false)).toBe(true);
    expect(loading(false, true, false)).toBe(true);
    expect(loading(false, false, true)).toBe(true);
    expect(loading(false, false, false)).toBe(false);
    contexts.sessions = { sessions: [], isLoading: false };
    contexts.workLogs = { entries: [], isLoading: false };
  });

  it('finds the last import, skipping unreadable times', () => {
    expect(lastImportMs([])).toBeNull();
    expect(
      lastImportMs([
        createMockWorkLogEntry({ updatedAt: 'never' }),
        createMockWorkLogEntry({ updatedAt: '2026-11-07T18:25:00.000Z' }),
        createMockWorkLogEntry({ updatedAt: '2026-11-01T00:00:00.000Z' }),
      ])
    ).toBe(Date.parse('2026-11-07T18:25:00.000Z'));
  });
});
