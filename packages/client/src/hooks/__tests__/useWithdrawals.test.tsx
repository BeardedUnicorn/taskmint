import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { WithdrawalsProvider } from '../../contexts/WithdrawalsContext';
import { announceAppRecordsChange, seedAppRecords } from '../../testing';
import { readAppRecord } from '../../services/appRecords';
import { createMockWithdrawal } from '../../__tests__/setup/payout-test-utils';
import { UNREADABLE_WITHDRAWALS, describeWithdrawal, useWithdrawals, useWithdrawalsState } from '../useWithdrawals';

const notifications = vi.hoisted(() => ({ showInfo: vi.fn(), showError: vi.fn() }));
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => notifications,
}));

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0).toISOString();

/** Saved elsewhere (another tab or device): the cache changes and readers hear of it. */
function savedElsewhere(withdrawals: unknown) {
  seedAppRecords({ withdrawals });
  announceAppRecordsChange({ keys: ['withdrawals'], conflict: false });
}

describe('useWithdrawals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs its provider, and reads it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useWithdrawals())).toThrow(
      'useWithdrawals must be used within a WithdrawalsProvider'
    );
    const wrapper = ({ children }: { children: ReactNode }) => <WithdrawalsProvider>{children}</WithdrawalsProvider>;
    expect(renderHook(() => useWithdrawals(), { wrapper }).result.current.withdrawals).toEqual([]);
  });

  it('lists the saved withdrawals oldest first, and none for a removed record', () => {
    seedAppRecords({
      withdrawals: [
        createMockWithdrawal({ id: 'late', takenAt: at(7) }),
        createMockWithdrawal({ id: 'early', takenAt: at(4) }),
      ],
    });
    const { result } = renderHook(() => useWithdrawalsState());
    expect(result.current.withdrawals.map(w => w.id)).toEqual(['early', 'late']);
    expect(result.current.loadError).toBeNull();

    act(() => savedElsewhere(null));
    expect(result.current.withdrawals).toEqual([]);

    // A removed record takes a new withdrawal like an empty one
    act(() => {
      result.current.recordWithdrawal({ takenAt: at(8), amountCents: 5 });
    });
    expect(readAppRecord('withdrawals')).toEqual([expect.objectContaining({ amountCents: 5 })]);
  });

  it('records, edits and deletes withdrawals, with an Undo for the delete', () => {
    const { result } = renderHook(() => useWithdrawalsState());

    let recorded: ReturnType<typeof result.current.recordWithdrawal> = null;
    act(() => {
      recorded = result.current.recordWithdrawal({ takenAt: at(7), amountCents: 71250, note: '  PayPal  ' });
    });
    expect(recorded).toMatchObject({ takenAt: at(7), amountCents: 71250, note: 'PayPal' });
    expect(readAppRecord('withdrawals')).toEqual([recorded]);

    act(() => {
      result.current.recordWithdrawal({ takenAt: at(10), amountCents: 100 });
    });
    const id = result.current.withdrawals[0].id;
    act(() => result.current.updateWithdrawal(id, { takenAt: at(7, 14), amountCents: 1, note: ' ' }));
    expect(result.current.withdrawals[0]).toEqual(expect.objectContaining({ id, takenAt: at(7, 14), amountCents: 1 }));
    expect(result.current.withdrawals[0]).not.toHaveProperty('note');
    // The other one is untouched
    expect(result.current.withdrawals[1]).toMatchObject({ amountCents: 100 });

    act(() => result.current.deleteWithdrawal(id));
    expect(result.current.withdrawals.map(w => w.amountCents)).toEqual([100]);
    expect(notifications.showInfo).toHaveBeenCalledWith('Deleted the withdrawal of $0.01 on Nov 7, 2:00 PM', {
      category: 'general',
      actions: [expect.objectContaining({ label: 'Undo' })],
    });

    const [, { actions }] = notifications.showInfo.mock.calls[0];
    act(() => actions[0].onClick());
    expect(result.current.withdrawals.map(w => w.id)).toEqual([id, expect.any(String)]);
  });

  it("deletes nothing for an id it doesn't have, and an Undo after it's back adds no copy", () => {
    seedAppRecords({ withdrawals: [createMockWithdrawal({ id: 'w' })] });
    const { result } = renderHook(() => useWithdrawalsState());
    act(() => result.current.deleteWithdrawal('missing'));
    expect(result.current.withdrawals).toHaveLength(1);
    expect(notifications.showInfo).not.toHaveBeenCalled();

    act(() => result.current.deleteWithdrawal('w'));
    const [, { actions }] = notifications.showInfo.mock.calls[0];
    act(() => savedElsewhere([createMockWithdrawal({ id: 'w' })]));
    act(() => actions[0].onClick());
    expect(result.current.withdrawals).toHaveLength(1);
  });

  it('refuses every change to a record it cannot read, and leaves it as it is', () => {
    seedAppRecords({ withdrawals: [{ id: 'broken' }] });
    const { result } = renderHook(() => useWithdrawalsState());
    expect(result.current.loadError).toBe(UNREADABLE_WITHDRAWALS);
    expect(result.current.withdrawals).toEqual([]);

    let recorded: ReturnType<typeof result.current.recordWithdrawal> = createMockWithdrawal();
    act(() => {
      recorded = result.current.recordWithdrawal({ takenAt: at(7), amountCents: 1 });
    });
    expect(recorded).toBeNull();
    expect(readAppRecord('withdrawals')).toEqual([{ id: 'broken' }]);
    expect(notifications.showError).toHaveBeenCalledWith(UNREADABLE_WITHDRAWALS, { category: 'general' });
  });

  it('turns down an amount that is not whole cents', () => {
    const { result } = renderHook(() => useWithdrawalsState());
    expect(() => result.current.recordWithdrawal({ takenAt: at(7), amountCents: 1.5 })).toThrow();
  });

  it('describes a withdrawal by amount and time', () => {
    expect(describeWithdrawal({ amountCents: 71250, takenAt: at(7, 18) })).toBe('$712.50 on Nov 7, 6:00 PM');
  });
});
