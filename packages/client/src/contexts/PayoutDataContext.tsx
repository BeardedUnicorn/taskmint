import { ReactNode } from 'react';
import { PayoutDataContext, usePayoutDataState } from '../hooks/usePayoutData';

/**
 * Holds the one copy of the payout data (cells, releases, the withdrawal
 * plan) that the Calendar, Payouts and the tray line all read (via
 * usePayoutData). Inside the sessions, tasks, work-log and withdrawals
 * providers.
 */
export function PayoutDataProvider({ children }: { children: ReactNode }) {
  const payoutData = usePayoutDataState();
  return <PayoutDataContext.Provider value={payoutData}>{children}</PayoutDataContext.Provider>;
}
