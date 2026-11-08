/**
 * Withdrawals: money the user took out of the payment site. Each one takes
 * the whole balance available at that moment, so the next withdrawal counts
 * only what is released after it (see utils/withdrawals).
 */

import { z } from 'zod';

export interface Withdrawal {
  id: string;
  /** When it was made on the site (ISO). */
  takenAt: string;
  /** What was withdrawn, in cents. */
  amountCents: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export const WithdrawalSchema = z.object({
  id: z.string().min(1),
  takenAt: z.iso.datetime(),
  amountCents: z.number().int().nonnegative(),
  note: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const WithdrawalListSchema = z.array(WithdrawalSchema);

/** What the user enters when recording or editing a withdrawal. */
export interface WithdrawalInput {
  takenAt: string;
  amountCents: number;
  note?: string;
}
