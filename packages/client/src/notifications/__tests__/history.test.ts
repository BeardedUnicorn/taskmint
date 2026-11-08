import { describe, it, expect } from 'vitest';
import {
  HistoryEntry,
  HISTORY_MAX_AGE_MS,
  MAX_HISTORY_ENTRIES,
  addHistoryEntry,
  bumpHistoryEntry,
  markAllRead,
  markHistoryUnread,
  normalizeHistory,
  persistableActions,
  unreadCount,
} from '../history';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const entry = (id: string, minutesAgo: number, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  severity: 'info',
  message: `message ${id}`,
  category: 'general',
  origin: 'app',
  delivery: 'toast',
  count: 1,
  read: false,
  ...extra,
});

describe('notification history', () => {
  it('keeps only buttons that open a page', () => {
    expect(
      persistableActions([
        { label: 'Undo', onClick: () => {} },
        { label: 'Review in Payouts', view: 'payouts' },
      ])
    ).toEqual([{ label: 'Review in Payouts', view: 'payouts', section: undefined }]);
    expect(persistableActions([{ label: 'Retry', onClick: () => {} }])).toBeUndefined();
  });

  it('reads saved history safely: valid entries, newest first, capped and recent', () => {
    const saved = [
      entry('old', HISTORY_MAX_AGE_MS / 60_000 + 1),
      entry('a', 10),
      { nonsense: true },
      entry('b', 1),
      entry('bad-view', 2, { actions: [{ label: 'Go', view: 'nowhere' as never }] }),
    ];
    const history = normalizeHistory(saved, NOW);
    expect(history.map(e => e.id)).toEqual(['b', 'bad-view', 'a']);
    expect(history[1].actions).toEqual([]);
    expect(normalizeHistory('corrupt', NOW)).toEqual([]);
  });

  it('skips saved entries that are no object, and counts a missing or bad count as one', () => {
    const history = normalizeHistory(
      [null, 'entry', entry('zero', 1, { count: 0 }), entry('none', 2, { count: undefined as never })],
      NOW
    );
    expect(history.map(e => [e.id, e.count])).toEqual([
      ['zero', 1],
      ['none', 1],
    ]);
  });

  it('marks one entry unread, leaving the rest', () => {
    const history = [entry('a', 1, { read: true }), entry('b', 2, { read: true })];
    expect(markHistoryUnread(history, 'b').map(e => e.read)).toEqual([true, false]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_HISTORY_ENTRIES + 5 }, (_, i) => entry(String(i), i));
    expect(addHistoryEntry([], many[0], NOW)).toHaveLength(1);
    expect(normalizeHistory(many, NOW)).toHaveLength(MAX_HISTORY_ENTRIES);
  });

  it('counts repeats, keeping one unread if any arrival was missed', () => {
    const other = entry('b', 6, { read: true });
    let history = [entry('a', 5, { read: true }), other];
    history = bumpHistoryEntry(history, 'a', {
      at: new Date(NOW).toISOString(),
      message: 'again',
      title: undefined,
      read: false,
    });
    expect(history[0]).toMatchObject({ count: 2, message: 'again', read: false });
    expect(history[1]).toBe(other);
    expect(unreadCount(history)).toBe(1);
    expect(unreadCount(markAllRead(history))).toBe(0);
  });
});
