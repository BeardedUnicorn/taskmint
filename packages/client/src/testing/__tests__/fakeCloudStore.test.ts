import { describe, expect, it, vi } from 'vitest';
import { bea, createFakeCloudStore } from '../fakeCloudStore';

describe('the fake cloud store', () => {
  it("tells each account's watchers about its epoch, and forgets a deleted one", async () => {
    const store = createFakeCloudStore();
    const seen = vi.fn();
    store.watchAccount('bea', seen);
    store.setEpoch('cal', 2);
    store.setEpoch('bea', 3);
    store.setEpoch('bea', null);
    expect(seen.mock.calls).toEqual([[3], [null]]);
    expect(await store.account('bea')).toBeNull();
    expect(await store.hasData('nobody')).toBe(false);
  });

  it('sends batches only to the listener still open', () => {
    const store = createFakeCloudStore();
    const first = vi.fn();
    const second = vi.fn();
    const closeFirst = store.listen('bea', null, first, vi.fn());
    store.listen('bea', 'c1', second, vi.fn());
    // Closing an older listener leaves the newer one open
    closeFirst();
    store.emit({ docs: [], cursor: 'c2' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ docs: [], cursor: 'c2' });
    expect(store.listens.map(entry => entry.open)).toEqual([false, true]);
    expect(bea('cal').email).toBe('cal@example.com');
  });
});
