/** The Payouts widget: the next withdrawal, else the next release, and the next few release days. */

import { describe, expect, it } from 'vitest';
import { createMockAmount, createMockPlan, createMockReleaseEvent } from '../../__tests__/setup/payout-test-utils';
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

/** A release at noon, as the phone counts it: by the end of its minute. */
const part = (releaseDay: string, cents: number, estimated = false) => ({
  atMs: new Date(`${releaseDay}T12:00:59.999`).getTime(),
  cents,
  estimated,
});

describe('payoutsWidget', () => {
  it('says when the next withdrawal opens, the next release under it, and the next release days', () => {
    const plan = createMockPlan({ next: createMockAmount({ actualCents: 110_000, estimatedCents: 2_345 }) });
    expect(payoutsWidget({ plan, schedule, events: [] })).toEqual({
      label: 'Next withdrawal',
      amount: '~$1,123',
      status: 'Opens Tue, Nov 10, 6:25 PM',
      isOpen: false,
      opensAtMs: plan.opensAtMs,
      nextRelease: 'Next release Sat, Nov 14 · $230',
      hint: null,
      releases: [
        { day: 'Sat, Nov 14', amount: '$230', parts: [part('2026-11-14', 20_000), part('2026-11-14', 3_000)] },
        { day: 'Mon, Nov 16', amount: '~$60', parts: [part('2026-11-16', 6_000, true)] },
        { day: 'Wed, Nov 18', amount: '$70', parts: [part('2026-11-18', 7_000)] },
      ],
      // An estimate in whole dollars: $1,123.45
      growth: { cents: 112_300, estimated: true, steps: [] },
    });
  });

  it('says a withdrawal is ready once it opens, with no release to come', () => {
    expect(payoutsWidget({ plan: createMockPlan({ isOpen: true }), schedule: [], events: [] })).toEqual({
      label: 'Next withdrawal',
      amount: '$1,100',
      status: 'Ready to withdraw',
      isOpen: true,
      opensAtMs: null,
      nextRelease: null,
      hint: null,
      releases: [],
      growth: { cents: 110_000, estimated: false, steps: [] },
    });
  });

  it('says what the withdrawal takes with each release after it opens, for the phone to follow', () => {
    const plan = createMockPlan();
    const at = (hour: number, minute: number, second = 0) => new Date(2026, 10, 11, hour, minute, second).getTime();
    const events = [
      // Released before the opening: in the amount already
      createMockReleaseEvent({ releaseMs: plan.opensAtMs - 1, actualCents: 9_999 }),
      // Two in one minute are one step, at the minute's end; an estimate is in whole dollars
      createMockReleaseEvent({ releaseMs: at(0, 20, 5), actualCents: 37_500 }),
      createMockReleaseEvent({ releaseMs: at(21, 57, 8), actualCents: 37_500 }),
      createMockReleaseEvent({ releaseMs: at(21, 57, 27), actualCents: 0, estimatedCents: 31_826, status: undefined }),
      // Paid: gone
      createMockReleaseEvent({ releaseMs: at(22, 0), status: 'Paid' }),
    ];
    expect(payoutsWidget({ plan, schedule: [], events })?.growth).toEqual({
      cents: 110_000,
      estimated: false,
      steps: [
        { atMs: at(0, 20, 59) + 999, cents: 37_500, estimated: false },
        { atMs: at(21, 57, 59) + 999, cents: 69_300, estimated: true },
      ],
    });
  });

  it("keeps the phone's sums in step with the app where estimates aren't whole dollars", () => {
    const at = (hour: number) => new Date(2026, 10, 14, hour).getTime();
    const estimates = (cents: number) =>
      [12, 13, 14].map(hour => ({ ...row('2026-11-14', 0, cents), releaseMs: at(hour) }));
    /** What the phone shows of the day once `gone` of its parts have been released: the rest, added up. */
    const left = (cents: number, gone: number) =>
      payoutsWidget({ plan: null, schedule: estimates(cents), events: [] })!
        .releases[0].parts.slice(gone)
        .reduce((sum, part) => sum + part.cents, 0);

    // Three estimates of $2.40: $7.20 in all, $4.80 after one, $2.40 after two
    expect([left(240, 0), left(240, 1), left(240, 2)]).toEqual([700, 500, 200]);
    // Parts under 50¢ still add up: $1.20, 80¢, 40¢
    expect([left(40, 0), left(40, 1), left(40, 2)]).toEqual([100, 100, 0]);

    // The withdrawal: $1,102.40 at its opening, and $2.40 more with each release after
    const plan = createMockPlan({ next: createMockAmount({ actualCents: 110_000, estimatedCents: 240 }) });
    const events = [1, 2, 3].map(hours =>
      createMockReleaseEvent({
        releaseMs: plan.opensAtMs + hours * 3_600_000,
        actualCents: 0,
        estimatedCents: 240,
        status: undefined,
      })
    );
    const growth = payoutsWidget({ plan, schedule: [], events })!.growth!;
    const taken = (passed: number) =>
      growth.steps.slice(0, passed).reduce((sum, step) => sum + step.cents, growth.cents);
    expect([taken(0), taken(1), taken(2), taken(3)]).toEqual([110_200, 110_500, 110_700, 111_000]);
  });

  it('keeps exact cents where nothing is an estimate, and whole dollars for actual money beside one', () => {
    const at = (hour: number) => new Date(2026, 10, 14, hour).getTime();
    const actual = [
      { ...row('2026-11-14', 1_050), releaseMs: at(12) },
      { ...row('2026-11-14', 2_075), releaseMs: at(13) },
    ];
    expect(
      payoutsWidget({ plan: null, schedule: actual, events: [] })!.releases[0].parts.map(part => part.cents)
    ).toEqual([1_050, 2_075]);

    // With an estimate later that day: $31.65 in all, $21.15 once the first is released
    const mixed = [...actual, { ...row('2026-11-14', 0, 40), releaseMs: at(14) }];
    expect(payoutsWidget({ plan: null, schedule: mixed, events: [] })!.releases[0].parts).toEqual([
      { atMs: at(12) + 59_999, cents: 1_100, estimated: false },
      { atMs: at(13) + 59_999, cents: 2_100, estimated: false },
      { atMs: at(14) + 59_999, cents: 0, estimated: true },
    ]);
  });

  it('follows no more than a dozen releases', () => {
    const plan = createMockPlan();
    const events = Array.from({ length: 20 }, (_, index) =>
      createMockReleaseEvent({ releaseMs: plan.opensAtMs + (index + 1) * 3_600_000 })
    );
    expect(payoutsWidget({ plan, schedule: [], events })?.growth?.steps).toHaveLength(12);
  });

  it('shows the next release until a withdrawal is recorded, and nothing when none is coming', () => {
    expect(payoutsWidget({ plan: null, schedule, events: [] })).toMatchObject({
      label: 'Next release',
      amount: '$230',
      status: 'Sat, Nov 14',
      nextRelease: null,
      hint: 'Record a withdrawal to plan the next one.',
      growth: null,
    });
    expect(payoutsWidget({ plan: null, schedule: [], events: [] })).toBeNull();
  });
});
