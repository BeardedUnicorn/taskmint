/** Shared figures for the widget builders' tests: Friday, Nov 13 2026, 2 PM. */

import type { PayoutDayCell } from '../../utils/payoutCalculator';
import { createMockTaskSession, createMockTimerInstance } from '../../__tests__/setup/session-test-utils';

export const MINUTE = 60_000;
export const NOW = new Date(2026, 10, 13, 14, 0).getTime();
export const TODAY = '2026-11-13';

export const cell = (overrides: Partial<PayoutDayCell> = {}): PayoutDayCell =>
  ({
    workDay: TODAY,
    taskId: 't',
    taskName: 'Writing',
    actualCents: 0,
    estimatedCents: 0,
    trackedMs: 0,
    importedMinutes: 0,
    statuses: [],
    releaseDay: '2026-11-20',
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
    ...overrides,
  }) as PayoutDayCell;

/** A session on "Writing" whose timer started 60 minutes ago (10 of them paused), running or paused. */
export const working = (paused: boolean) =>
  createMockTaskSession({
    taskName: 'Writing',
    isActive: true,
    timerInstances: [
      createMockTimerInstance({
        startTime: new Date(NOW - 60 * MINUTE).toISOString(),
        pausedDuration: 10 * MINUTE,
        isRunning: !paused,
        isPaused: paused,
        pausedAt: paused ? new Date(NOW).toISOString() : undefined,
      }),
    ],
  });
