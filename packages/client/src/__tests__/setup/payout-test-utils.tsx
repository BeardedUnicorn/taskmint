/**
 * Test support for the money views: withdrawals, a payout-data value to
 * provide directly (no sessions, tasks or work logs behind it), and a render
 * with the real withdrawals provider (reading the seeded app records).
 */

import { ReactElement, ReactNode } from 'react';
import { render } from './test-helpers';
import { PayoutData, PayoutDataContext } from '../../hooks/usePayoutData';
import { WithdrawalsProvider } from '../../contexts/WithdrawalsContext';
import { Withdrawal } from '../../types/withdrawal';
import { ReleaseEvent } from '../../utils/payoutCalculator';
import { WithdrawableAmount, WithdrawalPlan } from '../../utils/withdrawals';
import { formatDateString } from '../../utils/dateHelpers';

export const createMockWithdrawal = (overrides: Partial<Withdrawal> = {}): Withdrawal => ({
  id: 'withdrawal-1',
  takenAt: new Date(2026, 10, 7, 18, 25).toISOString(),
  amountCents: 71250,
  createdAt: '2026-11-07T00:00:00.000Z',
  updatedAt: '2026-11-07T00:00:00.000Z',
  ...overrides,
});

export const createMockAmount = (overrides: Partial<WithdrawableAmount> = {}): WithdrawableAmount => {
  const amount = { actualCents: 0, estimatedCents: 0, pastDueCents: 0, ...overrides };
  return { ...amount, totalCents: amount.actualCents + amount.estimatedCents };
};

export const createMockPlan = (overrides: Partial<WithdrawalPlan> = {}): WithdrawalPlan => ({
  last: createMockWithdrawal(),
  allowedAtMs: new Date(2026, 10, 10, 18, 25).getTime(),
  opensAtMs: new Date(2026, 10, 10, 18, 25).getTime(),
  isOpen: false,
  next: createMockAmount({ actualCents: 110000 }),
  availableNow: createMockAmount({ actualCents: 52500 }),
  ifYouWait: [],
  ...overrides,
});

export const createMockReleaseEvent = (overrides: Partial<ReleaseEvent> = {}): ReleaseEvent => ({
  releaseDay: '2026-11-10',
  releaseTime: '11:53 PM',
  releaseMs: new Date(2026, 10, 10, 23, 53).getTime(),
  actualCents: 52500,
  estimatedCents: 0,
  taskId: 'task-1',
  taskName: 'Wolverine',
  workDay: '2026-11-03',
  status: 'Pending Approval',
  reportedMs: new Date(2026, 10, 7, 18, 25).getTime(),
  ...overrides,
});

export const createMockPayoutData = (overrides: Partial<PayoutData> = {}): PayoutData => {
  const nowMs = overrides.nowMs ?? Date.now();
  return {
    fundsReleaseDays: 7,
    withdrawalIntervalDays: 3,
    nowMs,
    today: formatDateString(new Date(nowMs)),
    cells: [],
    events: [],
    schedule: [],
    summary: {
      availableCents: 0,
      pendingCents: 0,
      estimatedCents: 0,
      nextReleaseDay: null,
      nextReleaseCents: 0,
      overduePendingCents: 0,
    },
    monthGroups: [],
    plan: null,
    reminder: null,
    lastImport: null,
    importIsStale: false,
    isEmpty: false,
    isLoading: false,
    ...overrides,
  };
};

/** The real withdrawals provider (over the seeded records), with this payout data. */
export function MoneyProviders({ payoutData, children }: { payoutData: PayoutData; children: ReactNode }) {
  return (
    <WithdrawalsProvider>
      <PayoutDataContext.Provider value={payoutData}>{children}</PayoutDataContext.Provider>
    </WithdrawalsProvider>
  );
}

export function renderWithMoney(ui: ReactElement, payoutData: Partial<PayoutData> = {}) {
  const value = createMockPayoutData(payoutData);
  return render(<MoneyProviders payoutData={value}>{ui}</MoneyProviders>);
}
