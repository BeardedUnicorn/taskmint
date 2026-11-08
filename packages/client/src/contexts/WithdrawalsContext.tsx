import { ReactNode } from 'react';
import { WithdrawalsContext, useWithdrawalsState } from '../hooks/useWithdrawals';

/**
 * Holds the one copy of the recorded withdrawals that the Calendar, Payouts
 * and the tray line all read (via useWithdrawals).
 */
export function WithdrawalsProvider({ children }: { children: ReactNode }) {
  const withdrawals = useWithdrawalsState();
  return <WithdrawalsContext.Provider value={withdrawals}>{children}</WithdrawalsContext.Provider>;
}
