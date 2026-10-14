import { describe, it, expect } from 'vitest';
import {
  HistoryEntry,
  HISTORY_MAX_AGE_MS,
  MAX_HISTORY_ENTRIES,
  addHistoryEntry,
  bumpHistoryEntry,
  markAllRead,
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

  it('caps the list', () => {
    const many = Array.from({ length: MAX_HISTORY_ENTRIES + 5 }, (_, i) => entry(String(i), i));
    expect(addHistoryEntry([], many[0], NOW)).toHaveLength(1);
    expect(normalizeHistory(many, NOW)).toHaveLength(MAX_HISTORY_ENTRIES);
  });

  it('counts repeats, keeping one unread if any arrival was missed', () => {
    let history = [entry('a', 5, { read: true })];
    history = bumpHistoryEntry(history, 'a', { at: new Date(NOW).toISOString(), message: 'again', title: undefined, read: false });
    expect(history[0]).toMatchObject({ count: 2, message: 'again', read: false });
    expect(unreadCount(history)).toBe(1);
    expect(unreadCount(markAllRead(history))).toBe(0);
  });
});
