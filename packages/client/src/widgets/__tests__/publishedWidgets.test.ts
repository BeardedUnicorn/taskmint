/** The widgets' figures as published: the document, and when it's due. */

import { describe, expect, it } from 'vitest';
import { createMockPayoutData } from '../../__tests__/setup/payout-test-utils';
import { APP_VERSION } from '../../utils/appVersion';
import { fnv1a64 } from '../../utils/fnv';
import { MAX_WIDGETS_JSON, PUBLISH_EVERY_MS, publishedWidgets, widgetsDue } from '../publishedWidgets';
import { widgetSnapshot } from '../widgetSnapshot';
import { MINUTE, NOW, TASKS, cell, working } from './widgetFixtures';

const snapshot = (paused = false, cents = 4_550) =>
  widgetSnapshot({
    payout: createMockPayoutData({ nowMs: NOW, cells: [cell({ estimatedCents: cents, trackedMs: 133 * MINUTE })] }),
    goal: { enabled: true, percent: 45.5 },
    sessions: [working(paused)],
    tasks: TASKS,
    withdrawals: [],
    goalFor: () => 100,
  });

describe('publishedWidgets', () => {
  it('is the snapshot and its zone, under the snapshot’s version', () => {
    const doc = publishedWidgets(snapshot(), 'America/Chicago')!;
    expect(doc).toEqual({ json: doc.json, hash: fnv1a64(doc.json), schema: 2, appVersion: APP_VERSION });
    expect(JSON.parse(doc.json)).toEqual({ ...snapshot(), zone: 'America/Chicago' });
    // The same figures are the same bytes
    expect(publishedWidgets(snapshot(), 'America/Chicago')).toEqual(doc);
  });

  it('is nothing when too large for the rules', () => {
    const large = snapshot();
    large.timer!.task = 'W'.repeat(MAX_WIDGETS_JSON);
    expect(publishedWidgets(large, 'UTC')).toBeNull();
  });
});

describe('widgetsDue', () => {
  it('is due the first time, and not again with the same text', () => {
    const mark = widgetsDue(null, snapshot(), NOW)!;
    expect(mark).toMatchObject({ atMs: NOW, text: JSON.stringify(snapshot()) });
    expect(widgetsDue(mark, snapshot(), NOW + PUBLISH_EVERY_MS)).toBeNull();
  });

  it('lets a running timer’s figures wait a quarter of an hour', () => {
    const mark = widgetsDue(null, snapshot(), NOW)!;
    const grown = snapshot(false, 4_700);
    expect(widgetsDue(mark, grown, NOW + PUBLISH_EVERY_MS - 1)).toBeNull();
    expect(widgetsDue(mark, grown, NOW + PUBLISH_EVERY_MS)).toMatchObject({ atMs: NOW + PUBLISH_EVERY_MS });
  });

  it('is due at once when the timer or the day changes, or nothing runs', () => {
    const mark = widgetsDue(null, snapshot(), NOW)!;
    expect(widgetsDue(mark, snapshot(true), NOW + 1)).not.toBeNull();
    expect(widgetsDue(mark, { ...snapshot(), day: '2027-01-01' }, NOW + 1)).not.toBeNull();
    const paused = widgetsDue(null, snapshot(true), NOW)!;
    expect(widgetsDue(paused, snapshot(true, 4_700), NOW + 1)).not.toBeNull();
    expect(widgetsDue(paused, { ...snapshot(true, 4_700), timer: null }, NOW + 1)).not.toBeNull();
  });

  it('is due at once when the next withdrawal changes while a timer runs, but not for its releases alone', () => {
    const payouts = {
      label: 'Next withdrawal',
      amount: '$521',
      status: 'Opens Wed, Nov 18, 12:07 AM',
      isOpen: false,
      opensAtMs: NOW + MINUTE,
      nextRelease: null,
      hint: null,
      releases: [],
      growth: { cents: 52_085, estimated: false, steps: [] },
    };
    const mark = widgetsDue(null, { ...snapshot(), payouts }, NOW)!;
    // A withdrawal recorded: nothing to take until the next opening
    const withdrawn = { ...payouts, amount: '$0', status: 'Opens Sat, Nov 21, 12:30 AM' };
    expect(widgetsDue(mark, { ...snapshot(), payouts: withdrawn }, NOW + 1)).not.toBeNull();
    expect(widgetsDue(mark, { ...snapshot(), payouts: null }, NOW + 1)).not.toBeNull();
    const moved = { ...payouts, growth: { ...payouts.growth, steps: [{ atMs: NOW, cents: 100, estimated: true }] } };
    expect(widgetsDue(mark, { ...snapshot(), payouts: moved }, NOW + 1)).toBeNull();
  });
});
