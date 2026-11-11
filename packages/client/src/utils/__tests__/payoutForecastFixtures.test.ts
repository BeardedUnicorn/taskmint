/**
 * The payout forecast's golden fixtures (docs/contracts/payout-forecast/):
 * a forecast, and what TaskMint itself says at a fixed now: what a withdrawal
 * takes at various times (withdrawableAt), and the next withdrawal
 * (planWithdrawals). A reader of the contract (BudgetMint) must get the same
 * from the forecast alone. `UPDATE_FIXTURES=1` writes them again.
 *
 * The times are mid-January, around noon UTC: no daylight-saving change is
 * near, and the work days read the same from UTC-11 to UTC+11, so the
 * fixtures hold on a host in any of those zones.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Withdrawal } from '../../types/withdrawal';
import type { WorkLogEntry } from '../../types/workLog';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
  createMockWorkLogEntry,
} from '../../__tests__/setup/session-test-utils';
import { buildPayoutCells, buildReleaseEvents } from '../payoutCalculator';
import { PayoutInputs, buildPayoutForecast } from '../payoutForecast';
import { DAY_MS, planWithdrawals, withdrawableAt } from '../withdrawals';

/** The repository's root: the folder with the pnpm workspace, up from where the tests run. */
function repoRoot(from = process.cwd()): string {
  return existsSync(join(from, 'pnpm-workspace.yaml')) ? from : repoRoot(dirname(from));
}

const DIR = join(repoRoot(), 'docs/contracts/payout-forecast');
const UPDATE = process.env.UPDATE_FIXTURES === '1';
const ZONE = 'America/Chicago';
const MINUTE = 60_000;
const at = (day: number, hour = 12, minute = 0) => Date.UTC(2027, 0, day, hour, minute);
const iso = (ms: number) => new Date(ms).toISOString();

function entry(id: string, day: number, cents: number, status: string, reportedMs: number): WorkLogEntry {
  return createMockWorkLogEntry({
    id,
    createdAt: iso(at(day)),
    workDay: `2027-01-${String(day).padStart(2, '0')}`,
    amountCents: cents,
    status,
    importedAt: iso(reportedMs),
    updatedAt: iso(reportedMs),
  });
}

const withdrawal = (id: string, ms: number, cents: number): Withdrawal => ({
  id,
  takenAt: iso(ms),
  amountCents: cents,
  createdAt: iso(ms),
  updatedAt: iso(ms),
});

function inputs(overrides: Partial<PayoutInputs>): PayoutInputs {
  return {
    entries: [],
    sessions: [],
    tasks: [createMockTask({ id: 'task-1', hourlyRate: 60 }), createMockTask({ id: 'task-2', hourlyRate: 30 })],
    withdrawals: [],
    scheduled: null,
    fundsReleaseDays: 7,
    withdrawalIntervalDays: 3,
    ...overrides,
  };
}

// The site's numbers as imported on Jan 14 at 13:00
const IMPORTED = at(14, 13);
const LEDGER = [
  entry('kept', 4, 300, 'Untransferred', IMPORTED),
  entry('taken', 4, 700, 'Untransferred', at(10)),
  entry('late', 5, 500, 'Pending Approval', IMPORTED),
  entry('released', 7, 400, 'Pending Approval', IMPORTED),
  entry('soon', 9, 1000, 'Pending Approval', IMPORTED),
  entry('later', 10, 2000, 'Pending Approval', IMPORTED),
  entry('much-later', 13, 4000, 'Pending Approval', IMPORTED),
  entry('paid', 10, 9999, 'Paid', IMPORTED),
];

/** Running since noon on Jan 14 (last changed 12:30); task-2 paused on Jan 13 after an hour. */
const TIMERS = [
  createMockTaskSession({
    timerInstances: [
      createMockTimerInstance({
        id: 'run',
        isRunning: true,
        startTime: iso(at(14, 12)),
        updatedAt: iso(at(14, 12, 30)),
      }),
      createMockTimerInstance({
        id: 'pause',
        isPaused: true,
        startTime: iso(at(13, 14)),
        pausedAt: iso(at(13, 15)),
        updatedAt: iso(at(13, 15)),
        task: { taskId: 'task-2', taskName: 'Other', hourlyRate: 30 },
      }),
    ],
  }),
];

interface Scenario {
  name: string;
  description: string;
  inputs: PayoutInputs;
  /** Now, for TaskMint's answers. */
  nowMs: number;
  /** When to ask what a withdrawal takes. */
  times: number[];
}

const SCENARIOS: Scenario[] = [
  {
    name: 'no-withdrawal',
    description: 'Imports and no withdrawal recorded: everything not Paid counts, and there is no next withdrawal.',
    inputs: inputs({ entries: LEDGER }),
    nowMs: at(15),
    times: [at(15), at(16, 12), at(17, 12), at(20, 12), at(30)],
  },
  {
    name: 'after-withdrawal',
    description:
      'A withdrawal on Jan 13 at noon, the next allowed three days later: carried money, past due money, and releases to come.',
    inputs: inputs({ entries: LEDGER, withdrawals: [withdrawal('w1', at(13), 5000), withdrawal('w0', at(9), 2500)] }),
    nowMs: at(15),
    times: [at(15), at(16, 12), at(16, 13), at(17, 12), at(20, 12), at(30)],
  },
  {
    name: 'window-open',
    description: 'The last withdrawal long ago: the next is open now, and takes everything released since.',
    inputs: inputs({ entries: LEDGER, withdrawals: [withdrawal('w1', at(2), 1000)] }),
    nowMs: at(15),
    times: [at(15), at(17, 12), at(30)],
  },
  {
    name: 'open-timers',
    description:
      'A running timer (last changed 12:30, at $60/h) and a paused one: their steps are open, as of 12:30. At now (13:30) the running one has earned an hour more, and both are released 7 days after now.',
    inputs: inputs({ entries: LEDGER, sessions: TIMERS, withdrawals: [withdrawal('w1', at(13), 5000)] }),
    nowMs: at(14, 13, 30),
    times: [at(14, 13, 30), at(20, 12), at(21, 13, 30) - MINUTE, at(21, 13, 30), at(30)],
  },
];

/** What TaskMint says at the scenario's now. */
function answers({ inputs: data, nowMs, times }: Scenario) {
  const cells = buildPayoutCells(data.entries, data.sessions, data.tasks, data.fundsReleaseDays, nowMs);
  const events = buildReleaseEvents(cells, data.entries, data.fundsReleaseDays);
  const intervalMs = data.withdrawalIntervalDays * DAY_MS;
  const plan = planWithdrawals(events, data.withdrawals, intervalMs, nowMs);
  const cutoffMs = plan ? Date.parse(plan.last.takenAt) : null;
  return {
    withdrawable: times.map(atMs => ({ atMs, ...withdrawableAt(events, cutoffMs, atMs) })),
    next: plan && { opensAtMs: plan.opensAtMs, isOpen: plan.isOpen, ...plan.next },
  };
}

describe('the payout forecast’s golden fixtures', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.name}: ${scenario.description}`, () => {
      const forecast = buildPayoutForecast(scenario.inputs, ZONE);
      // The contract holds from when the data was last written: no reader's now is earlier
      for (const atMs of [scenario.nowMs, ...scenario.times]) expect(atMs).toBeGreaterThanOrEqual(forecast.asOfMs);
      const fixture = { description: scenario.description, nowMs: scenario.nowMs, forecast, ...answers(scenario) };
      const file = join(DIR, `${scenario.name}.json`);
      if (UPDATE) {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
      }
      expect(existsSync(file), `${file} is missing: run with UPDATE_FIXTURES=1`).toBe(true);
      expect(fixture).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    });
  }
});
