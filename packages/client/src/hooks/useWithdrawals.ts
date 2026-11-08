/**
 * The withdrawals the user recorded (the `withdrawals` app record), oldest
 * first, and the ways to change them. A record that doesn't read as a list of
 * withdrawals is left exactly as it is: it's reported, and every change is
 * refused rather than written over it.
 */

import { createContext, useCallback, useContext, useMemo } from 'react';
import { STORAGE_KEYS } from '../constants';
import { useNotification } from '../contexts/NotificationContext';
import { Withdrawal, WithdrawalInput, WithdrawalListSchema, WithdrawalSchema } from '../types/withdrawal';
import { centsToDollars } from '../utils/payoutCalculator';
import { formatCurrency } from '../utils/formatters';
import { formatShortDateTime } from '../utils/locale';
import { useAppRecord } from './useAppRecord';

export const UNREADABLE_WITHDRAWALS =
  "Your saved withdrawals couldn't be read, so TaskMint can't work out your next withdrawal. They're kept as they are; restoring a backup fixes them.";

export interface UseWithdrawalsReturn {
  /** Oldest first. Empty while the record can't be read. */
  withdrawals: Withdrawal[];
  /** Why the saved withdrawals can't be used, or null. */
  loadError: string | null;
  /** The new withdrawal, or null when the record can't be changed. */
  recordWithdrawal: (input: WithdrawalInput) => Withdrawal | null;
  updateWithdrawal: (id: string, input: WithdrawalInput) => void;
  /** Deletes it, with an Undo on the toast. */
  deleteWithdrawal: (id: string) => void;
}

export const WithdrawalsContext = createContext<UseWithdrawalsReturn | null>(null);

/** The withdrawals every page shares; provided by WithdrawalsProvider. */
export function useWithdrawals(): UseWithdrawalsReturn {
  const context = useContext(WithdrawalsContext);
  if (!context) {
    throw new Error('useWithdrawals must be used within a WithdrawalsProvider');
  }
  return context;
}

const byTakenAt = (a: Withdrawal, b: Withdrawal) => Date.parse(a.takenAt) - Date.parse(b.takenAt);

/** The parts of a withdrawal the user enters, cleaned up (a blank note is no note). */
function fromInput(input: WithdrawalInput): Pick<Withdrawal, 'takenAt' | 'amountCents' | 'note'> {
  const note = input.note?.trim();
  return { takenAt: input.takenAt, amountCents: input.amountCents, ...(note ? { note } : {}) };
}

/** "$712.50 on Nov 7, 6:25 PM" */
export function describeWithdrawal(withdrawal: Pick<Withdrawal, 'amountCents' | 'takenAt'>): string {
  return `${formatCurrency(centsToDollars(withdrawal.amountCents))} on ${formatShortDateTime(withdrawal.takenAt)}`;
}

/** The withdrawals state itself. Use once, in WithdrawalsProvider. */
export function useWithdrawalsState(): UseWithdrawalsReturn {
  const [stored, setStored] = useAppRecord<unknown>(STORAGE_KEYS.WITHDRAWALS, []);
  const { showInfo, showError } = useNotification();

  // A removed record (null) is no withdrawals
  const parsed = useMemo(() => WithdrawalListSchema.safeParse(stored ?? []), [stored]);
  const withdrawals = useMemo(() => (parsed.success ? [...parsed.data].sort(byTakenAt) : []), [parsed]);
  const readable = parsed.success;

  /** Applies `change` to the saved list; false (and an error toast) when it can't be read. */
  const save = useCallback(
    (change: (list: Withdrawal[]) => Withdrawal[]): boolean => {
      if (!readable) {
        showError(UNREADABLE_WITHDRAWALS, { category: 'general' });
        return false;
      }
      setStored((previous: unknown) => change(WithdrawalListSchema.parse(previous ?? [])));
      return true;
    },
    [readable, setStored, showError]
  );

  const recordWithdrawal = useCallback(
    (input: WithdrawalInput): Withdrawal | null => {
      const now = new Date().toISOString();
      const withdrawal = WithdrawalSchema.parse({
        id: crypto.randomUUID(),
        ...fromInput(input),
        createdAt: now,
        updatedAt: now,
      });
      return save(list => [...list, withdrawal]) ? withdrawal : null;
    },
    [save]
  );

  const updateWithdrawal = useCallback(
    (id: string, input: WithdrawalInput) => {
      const changes = fromInput(input);
      save(list =>
        list.map(withdrawal => {
          if (withdrawal.id !== id) return withdrawal;
          const { note: _note, ...rest } = withdrawal;
          return WithdrawalSchema.parse({ ...rest, ...changes, updatedAt: new Date().toISOString() });
        })
      );
    },
    [save]
  );

  const deleteWithdrawal = useCallback(
    (id: string) => {
      const snapshot = withdrawals.find(withdrawal => withdrawal.id === id);
      if (!snapshot || !save(list => list.filter(withdrawal => withdrawal.id !== id))) return;
      showInfo(`Deleted the withdrawal of ${describeWithdrawal(snapshot)}`, {
        category: 'general',
        actions: [
          {
            label: 'Undo',
            // Back as it was, unless it's already back
            onClick: () => {
              save(list => (list.some(withdrawal => withdrawal.id === id) ? list : [...list, snapshot]));
            },
          },
        ],
      });
    },
    [withdrawals, save, showInfo]
  );

  return {
    withdrawals,
    loadError: readable ? null : UNREADABLE_WITHDRAWALS,
    recordWithdrawal,
    updateWithdrawal,
    deleteWithdrawal,
  };
}
