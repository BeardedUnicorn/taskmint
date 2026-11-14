import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { EVENTS, type OutgoingDoc } from '@taskmint/contracts';

import { useImportOutcome } from '../useImportOutcome';
import { SyncEngine, setCloudSyncForTest } from '../../../../cloud';
import { syncHost } from '../../../../cloud/__tests__/syncHost';
import type { ImportResult } from '../../../../hooks/useDataBackup';
import type { NotifyOptions } from '../../../../notifications/types';
import { asBackend, bea, createFakeCloudStore, installFakeBackendForTest } from '../../../../testing';
import { reloadApp } from '../../../../utils/appReload';

const mockNotify = vi.fn<(options: NotifyOptions) => void>();
const mockShowError = vi.fn();
vi.mock('../../../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify, showError: mockShowError }),
}));
vi.mock('../../../../utils/appReload', () => ({ reloadApp: vi.fn() }));

const result = (mode: ImportResult['mode']) => ({ mode }) as ImportResult;
const messages = () => mockNotify.mock.calls.map(([notice]) => notice.message);

/** The web app: its data is only in the cloud. */
const onTheWeb = () => installFakeBackendForTest({ capabilities: { runtime: 'web', dataLocation: 'cloud' } });

/** A stand-in for the page's sync, with `flush` as given. */
const syncWith = (flush: () => Promise<void>) => {
  setCloudSyncForTest({ flush, stop: vi.fn() } as unknown as SyncEngine);
  return flush;
};

afterEach(() => setCloudSyncForTest(null));

describe('useImportOutcome', () => {
  it('says so and reloads where the data is kept on the device, without waiting for sync', async () => {
    const flush = syncWith(vi.fn(async () => undefined));
    const { result: outcome } = renderHook(() => useImportOutcome());

    outcome.current.onImportSuccess(result('merge'));
    outcome.current.onImportSuccess(result('replace'));

    expect(messages()).toEqual(['Data imported. Reloading…', 'Backup restored. Reloading…']);
    await waitFor(() => expect(reloadApp).toHaveBeenCalledTimes(2));
    expect(flush).not.toHaveBeenCalled();
  });

  it('says why an import failed', () => {
    const { result: outcome } = renderHook(() => useImportOutcome());
    outcome.current.onImportError(new Error('Not a TaskMint export'));
    outcome.current.onImportError(null);
    expect(mockShowError.mock.calls).toEqual([['Not a TaskMint export'], ["Couldn't import that file"]]);
  });

  describe('where the data is only in the cloud', () => {
    it('reloads only once the cloud has what was restored', async () => {
      onTheWeb();
      const restored: OutgoingDoc = { docId: 'session~s1', kind: 'session', id: 's1', json: '{}', hash: 'h1' };
      const store = createFakeCloudStore();
      store.setEpoch('bea', 1);
      const host = syncHost({ account: { uid: 'bea', epoch: 1 } });
      // The app's own delays: a change is sent a second after it's made
      const engine = new SyncEngine(asBackend(host.backend), async () => store);
      await engine.start();
      store.setUser(bea());
      await waitFor(() => expect(engine.getView().phase).toBe('synced'));
      setCloudSyncForTest(engine);
      const writtenAtReload: OutgoingDoc[][] = [];
      vi.mocked(reloadApp).mockImplementation(() => {
        writtenAtReload.push(store.writes.flatMap(write => write.docs));
      });
      const { result: outcome } = renderHook(() => useImportOutcome());

      // The restore changed the page's data, which the engine hears of
      host.state.outgoing = [restored];
      host.backend.emit(EVENTS.SYNC_PENDING);
      outcome.current.onImportSuccess(result('replace'));

      await waitFor(() => expect(reloadApp).toHaveBeenCalled());
      expect(writtenAtReload).toEqual([[restored]]);
      expect(messages()).toEqual(['Backup restored. Saving it to your account, then reloading…']);
      expect(mockNotify.mock.calls[0][0]).toMatchObject({ severity: 'success', duration: null });
    });

    it('keeps the page when the cloud didn’t take it, and reloads once trying again works', async () => {
      onTheWeb();
      const flush = syncWith(
        vi
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(new Error('Can’t reach the cloud.'))
          .mockResolvedValueOnce(undefined)
      );
      const { result: outcome } = renderHook(() => useImportOutcome());

      outcome.current.onImportSuccess(result('merge'));

      await waitFor(() => expect(mockNotify).toHaveBeenCalledTimes(2));
      expect(messages()[0]).toBe('Data imported. Saving it to your account, then reloading…');
      const failed = mockNotify.mock.calls[1][0];
      expect(failed).toMatchObject({
        severity: 'error',
        title: 'Not saved to your account yet',
        message:
          'It’s only on this page so far: keep the page open, and try again before closing or reloading it. Can’t reach the cloud.',
        duration: null,
      });
      expect(reloadApp).not.toHaveBeenCalled();

      const [again] = failed.actions!;
      expect(again.label).toBe('Try again');
      await (again as { onClick: () => Promise<void> }).onClick();
      expect(flush).toHaveBeenCalledTimes(2);
      expect(reloadApp).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledTimes(2);
    });

    it('reloads at once in a build without sync', async () => {
      onTheWeb();
      const { result: outcome } = renderHook(() => useImportOutcome());
      outcome.current.onImportSuccess(result('replace'));
      await waitFor(() => expect(reloadApp).toHaveBeenCalled());
    });
  });
});
