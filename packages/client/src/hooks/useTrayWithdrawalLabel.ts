/**
 * The tray menu's line about the next withdrawal, where the platform has a
 * tray: sent whenever it changes (the money math lives here, not in the
 * shell). None until a withdrawal is recorded.
 */

import { useEffect } from 'react';
import { getBackend } from '../backend';
import { formatCents } from '../utils/payoutCalculator';
import { formatWeekdayDateTime } from '../utils/locale';
import { WithdrawalPlan } from '../utils/withdrawals';
import { usePayoutData } from './usePayoutData';

/** "Next withdrawal: Mon, Nov 10, 6:25 PM · $1,100.00", "Withdrawal open · $1,100.00 available", or null. */
export function trayWithdrawalLabel(plan: WithdrawalPlan | null): string | null {
  if (!plan) return null;
  const amount = `${plan.next.estimatedCents > 0 ? '~' : ''}${formatCents(plan.next.totalCents)}`;
  return plan.isOpen
    ? `Withdrawal open · ${amount} available`
    : `Next withdrawal: ${formatWeekdayDateTime(plan.opensAtMs)} · ${amount}`;
}

export function useTrayWithdrawalLabel(): void {
  const { plan } = usePayoutData();
  const label = trayWithdrawalLabel(plan);

  useEffect(() => {
    getBackend()
      .platform.tray?.setWithdrawalLabel(label)
      .catch(error => console.warn("Failed to update the tray's withdrawal line:", error));
  }, [label]);
}
