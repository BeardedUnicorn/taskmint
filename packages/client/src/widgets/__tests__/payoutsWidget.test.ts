/** The Payouts widget: the next withdrawal, else the next release, and the next few release days. */

import { describe, expect, it } from 'vitest';
import { createMockAmount, createMockPlan } from '../../__tests__/setup/payout-test-utils';
import type { ReleaseScheduleRow } from '../../utils/payoutCalculator';
import { payoutsWidget } from '../payoutsWidget';

const row = (releaseDay: string, actualCents: number, estimatedCents = 0): ReleaseScheduleRow => ({
  releaseDay,
  releaseMs: new Date(`${releaseDay}T12:00:00`).getTime(),
  actualCents,
  estimatedCents,
});

// Two rows on the 14th, then three more days: a tall widget lists the first three days
const schedule = [
  row('2026-11-14', 20_000),
  row('2026-11-14', 3_000),
  row('2026-11-16', 5_000, 1_000),
  row('2026-11-18', 7_000),
  row('2026-11-20', 9_000),
];

describe('payoutsWidget', () => {
  it('says when the next withdrawal opens, the next release under it, and the next release days', () => {
    const plan = createMockPlan({ next: createMockAmount({ actualCents: 110_000, estimatedCents: 2_345 }) });
    expect(payoutsWidget({ plan, schedule })).toEqual({
      label: 'Next withdrawal',
      amount: '~$1,123',
      status: 'Opens Tue, Nov 10, 6:25 PM',
      isOpen: false,
      opensAtMs: plan.opensAtMs,
      nextRelease: 'Next release Sat, Nov 14 · $230',
      hint: null,
      releases: [
        { day: 'Sat, Nov 14', amount: '$230' },
        { day: 'Mon, Nov 16', amount: '~$60' },
        { day: 'Wed, Nov 18', amount: '$70' },
      ],
    });
  });

  it('says a withdrawal is ready once it opens, with no release to come', () => {
    expect(payoutsWidget({ plan: createMockPlan({ isOpen: true }), schedule: [] })).toEqual({
      label: 'Next withdrawal',
      amount: '$1,100',
      status: 'Ready to withdraw',
      isOpen: true,
      opensAtMs: null,
      nextRelease: null,
      hint: null,
      releases: [],
    });
  });

  it('shows the next release until a withdrawal is recorded, and nothing when none is coming', () => {
    expect(payoutsWidget({ plan: null, schedule })).toMatchObject({
      label: 'Next release',
      amount: '$230',
      status: 'Sat, Nov 14',
      nextRelease: null,
      hint: 'Record a withdrawal to plan the next one.',
    });
    expect(payoutsWidget({ plan: null, schedule: [] })).toBeNull();
  });
});
