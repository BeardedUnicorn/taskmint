import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SyncStatusLine, syncStatus } from '../SyncStatusLine';
import { NavigationProvider, useNavigation } from '../../../contexts/NavigationContext';
import { SyncEngine, setCloudSyncForTest, type SyncPhase } from '../../../cloud';
import { asBackend, bea, createFakeCloudStore, installFakeBackendForTest } from '../../../testing';
import { syncHost } from '../../../cloud/__tests__/syncHost';

const OPTIONS = { sendDelayMs: 1, retryMs: 10_000, publishDelayMs: 1, publishRetryMs: 10_000 };

afterEach(() => setCloudSyncForTest(null));

function Where() {
  const { view, params } = useNavigation();
  return <output aria-label="where">{`${view} ${JSON.stringify(params)}`}</output>;
}

function renderLine(collapsed = false) {
  return render(
    <NavigationProvider>
      <SyncStatusLine collapsed={collapsed} />
      <Where />
    </NavigationProvider>
  );
}

describe('SyncStatusLine', () => {
  it('names each phase', () => {
    const label = (phase: SyncPhase) => syncStatus({ phase }).label;
    expect(label('synced')).toBe('Synced');
    expect(label('syncing')).toBe('Syncing…');
    expect(label('loading')).toBe('Connecting…');
    expect(label('connecting')).toBe('Connecting…');
    expect(label('signedOut')).toBe('Not signed in');
    for (const phase of ['choose', 'otherAccount', 'cloudReset', 'error'] as const) {
      expect(label(phase)).toBe('Sync needs attention');
    }
  });

  it('shows nothing without sync, or where the data is the cloud’s own', () => {
    const { container, unmount } = renderLine();
    expect(container.querySelector('button')).toBeNull();
    unmount();

    setCloudSyncForTest(new SyncEngine(asBackend(syncHost().backend), async () => createFakeCloudStore(), OPTIONS));
    installFakeBackendForTest({ capabilities: { dataLocation: 'cloud' } });
    renderLine();
    expect(screen.queryByRole('button', { name: /^Cloud sync/ })).not.toBeInTheDocument();
  });

  it('follows the sync, and opens its settings', async () => {
    const store = createFakeCloudStore();
    store.setEpoch('bea', 1);
    const engine = new SyncEngine(
      asBackend(syncHost({ account: { uid: 'bea', epoch: 1 } }).backend),
      async () => store,
      OPTIONS
    );
    setCloudSyncForTest(engine);
    await engine.start();
    renderLine();
    expect(screen.getByRole('button', { name: 'Cloud sync: Not signed in' })).toHaveTextContent('Not signed in');

    act(() => store.setUser(bea()));
    expect(await screen.findByRole('button', { name: 'Cloud sync: Synced' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cloud sync: Synced' }));
    expect(screen.getByRole('status', { name: 'where' })).toHaveTextContent('settings {"section":"sync"}');
  });

  it('is an icon with a tooltip when the sidebar is collapsed', async () => {
    const engine = new SyncEngine(asBackend(syncHost().backend), async () => createFakeCloudStore(), OPTIONS);
    setCloudSyncForTest(engine);
    await engine.start();
    renderLine(true);
    const line = screen.getByRole('button', { name: 'Cloud sync: Not signed in' });
    expect(line).not.toHaveTextContent('Not signed in');
    fireEvent.mouseOver(line);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cloud sync: Not signed in');
  });
});
