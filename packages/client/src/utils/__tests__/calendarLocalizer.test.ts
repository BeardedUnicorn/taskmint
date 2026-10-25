import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// The global test setup wraps dayjs with extra plugins (including timezone);
// this test needs exactly the plugin set the app loads.
vi.unmock('dayjs');

// A US zone, so November 2026 contains the fall-back DST change (Nov 1).
const DST_ZONE = 'America/Denver';

describe('calendarLocalizer', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = DST_ZONE;
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('keeps every visible day at local midnight across a DST change', async () => {
    const { calendarLocalizer } = await import('../calendarLocalizer');

    const days: Date[] = calendarLocalizer.visibleDays(new Date(2026, 10, 11), 'en');

    expect(days).toHaveLength(35); // Sun Nov 1 .. Sat Dec 5
    expect(days.map(d => d.getHours())).toEqual(Array(35).fill(0));
    const labels = days.map(d => `${d.getMonth() + 1}/${d.getDate()}`);
    expect(labels.slice(0, 3)).toEqual(['11/1', '11/2', '11/3']);
    expect(new Set(labels).size).toBe(35);
  });

  it('starts the spring-forward month on the right day too', async () => {
    const { calendarLocalizer } = await import('../calendarLocalizer');

    const days: Date[] = calendarLocalizer.visibleDays(new Date(2027, 2, 11), 'en');

    expect(days.map(d => d.getHours()).every(h => h === 0)).toBe(true);
    const labels = days.map(d => `${d.getMonth() + 1}/${d.getDate()}`);
    expect(labels[0]).toBe('2/28');
    expect(new Set(labels).size).toBe(days.length);
  });
});
