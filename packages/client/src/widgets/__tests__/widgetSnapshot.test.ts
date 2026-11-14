/** The whole snapshot: each widget's part, worked out from the same weeks. */

import { describe, expect, it } from 'vitest';
import { createMockPayoutData } from '../../__tests__/setup/payout-test-utils';
import { widgetSnapshot } from '../widgetSnapshot';
import { MINUTE, NOW, TODAY, cell, working } from './widgetFixtures';

describe('widgetSnapshot', () => {
  it("gives each widget its part, this week's figures agreeing across them", () => {
    const payout = createMockPayoutData({
      nowMs: NOW,
      cells: [
        cell({ workDay: '2026-10-19', actualCents: 2_000, importedMinutes: 30 }),
        cell({ workDay: TODAY, estimatedCents: 4_550, trackedMs: 133 * MINUTE }),
      ],
    });
    const snapshot = widgetSnapshot({
      payout,
      goal: { enabled: true, percent: 45.5 },
      sessions: [working(false)],
      withdrawals: [],
      goalFor: () => 100,
    });

    expect(snapshot).toMatchObject({
      version: 2,
      day: TODAY,
      today: { money: '~$46', goalPercent: 46, week: { money: '~$46', time: '2h 13m' } },
      timer: { task: 'Writing' },
      payouts: null,
      week: { totals: '~$46 · 2h 13m', goalLevel: 9100 },
    });
    // The agenda reaches back three weeks, to Oct 18's
    expect(snapshot.agenda.rows[0]).toMatchObject({ kind: 'week', date: '2026-10-18' });
    expect(snapshot.agenda.rows[snapshot.agenda.thisWeekIndex]).toMatchObject({ date: '2026-11-08' });
  });
});
