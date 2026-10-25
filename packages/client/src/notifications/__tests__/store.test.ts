import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastStore, ToastInput, EXIT_MS, MAX_VISIBLE, MAX_QUEUED, MIN_RESUME_MS, resolveDuration } from '../store';

const toast = (message: string, extra: Partial<ToastInput> = {}): ToastInput => ({
  key: message,
  severity: 'info',
  message,
  category: 'general',
  ...extra,
});

describe('ToastStore', () => {
  let store: ToastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new ToastStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const visibleMessages = () => store.getSnapshot().visible.filter(t => !t.exiting).map(t => t.message);
  const settle = () => vi.advanceTimersByTime(EXIT_MS);

  it('gives each severity its own time, and toasts with buttons at least 8s', () => {
    expect(resolveDuration('success', undefined, false)).toBe(4000);
    expect(resolveDuration('info', undefined, false)).toBe(5000);
    expect(resolveDuration('warning', undefined, false)).toBe(7000);
    expect(resolveDuration('error', undefined, false)).toBe(10000);
    expect(resolveDuration('success', undefined, true)).toBe(8000);
    expect(resolveDuration('error', null, true)).toBeNull();
    expect(resolveDuration('info', 1500, false)).toBe(1500);
  });

  it('dismisses a toast when its time runs out', () => {
    store.add(toast('Saved', { severity: 'success' }));
    vi.advanceTimersByTime(3999);
    expect(visibleMessages()).toEqual(['Saved']);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot().visible[0].exiting).toBe(true);
    settle();
    expect(store.getSnapshot().visible).toEqual([]);
  });

  it('merges a repeat into the toast showing (count, new text, fresh time)', () => {
    const first = store.add(toast('Backup failed', { key: 'backup', severity: 'error' }));
    vi.advanceTimersByTime(9000);
    const second = store.add(toast('Backup failed again', { key: 'backup', severity: 'error' }));

    expect(second).toBe(first);
    const [shown] = store.getSnapshot().visible;
    expect(shown.count).toBe(2);
    expect(shown.message).toBe('Backup failed again');
    vi.advanceTimersByTime(9000);
    expect(shown.exiting).toBe(false);
  });

  it('shows at most three, replacing the oldest that is not an error', () => {
    store.add(toast('error', { severity: 'error' }));
    store.add(toast('one'));
    store.add(toast('two'));
    store.add(toast('three'));

    expect(visibleMessages()).toEqual(['error', 'two', 'three']);
    expect(visibleMessages()).toHaveLength(MAX_VISIBLE);
  });

  it('never drops an error: it waits until there is room', () => {
    store.add(toast('e1', { severity: 'error' }));
    store.add(toast('e2', { severity: 'error' }));
    store.add(toast('e3', { severity: 'error' }));
    store.add(toast('e4', { severity: 'error' }));

    expect(visibleMessages()).toEqual(['e1', 'e2', 'e3']);
    expect(store.getSnapshot().queued.map(t => t.message)).toEqual(['e4']);

    store.dismiss(store.getSnapshot().visible[0].id);
    settle();
    expect(visibleMessages()).toEqual(['e2', 'e3', 'e4']);
  });

  it('keeps a bounded queue of non-errors, reporting the ones it drops', () => {
    const dropped: string[] = [];
    store.onDropped = t => dropped.push(t.message);
    for (let i = 0; i < 3; i++) store.add(toast(`sticky ${i}`, { duration: null }));
    for (let i = 0; i < MAX_QUEUED + 2; i++) store.add(toast(`waiting ${i}`));

    expect(store.getSnapshot().queued).toHaveLength(MAX_QUEUED);
    expect(dropped).toEqual(['waiting 0', 'waiting 1']);
  });

  it('holds the time while hovered, giving at least 2s after', () => {
    const id = store.add(toast('Hover me'));
    vi.advanceTimersByTime(4900);
    store.hold(id, 'hover');
    vi.advanceTimersByTime(60_000);
    expect(visibleMessages()).toEqual(['Hover me']);

    store.release(id, 'hover');
    vi.advanceTimersByTime(MIN_RESUME_MS - 1);
    expect(visibleMessages()).toEqual(['Hover me']);
    vi.advanceTimersByTime(1);
    expect(visibleMessages()).toEqual([]);
  });

  it('waits while you are away from the window, including for new toasts', () => {
    store.setWindowHeld(true);
    store.add(toast('While away'));
    vi.advanceTimersByTime(60_000);
    expect(visibleMessages()).toEqual(['While away']);

    store.setWindowHeld(false);
    vi.advanceTimersByTime(5000);
    expect(visibleMessages()).toEqual([]);
  });

  it('needs every hold released before the time runs again', () => {
    const id = store.add(toast('Held twice'));
    store.hold(id, 'hover');
    store.hold(id, 'focus');
    store.release(id, 'hover');
    vi.advanceTimersByTime(30_000);
    expect(visibleMessages()).toEqual(['Held twice']);
  });

  it('keeps a sticky toast until dismissed, and dismissAll clears everything', () => {
    store.add(toast('Sticky', { duration: null }));
    vi.advanceTimersByTime(600_000);
    expect(visibleMessages()).toEqual(['Sticky']);

    store.dismissAll();
    settle();
    expect(store.getSnapshot()).toEqual({ visible: [], queued: [] });
  });

  it('updates a toast in place', () => {
    const id = store.add(toast('Uploading…'));
    store.update(id, { message: 'Uploaded', severity: 'success' });
    expect(store.getSnapshot().visible[0]).toMatchObject({ message: 'Uploaded', severity: 'success' });
  });
});
