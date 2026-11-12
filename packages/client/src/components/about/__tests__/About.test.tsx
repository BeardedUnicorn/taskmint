import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '../../../__tests__/setup/test-helpers';
import { renderHook } from '@testing-library/react';
import { AboutProvider, diagnostics, useAbout, useOptionalAbout } from '../About';
import { AppExtensionsProvider } from '../../../app/extensions';
import { NavigationProvider, useNavigation } from '../../../contexts/NavigationContext';
import { SyncEngine, setCloudSyncForTest } from '../../../cloud';
import { asBackend, bea, createFakeCloudStore, fakeBackend, installFakeBackendForTest } from '../../../testing';
import { syncHost } from '../../../cloud/__tests__/syncHost';
import { APP_VERSION } from '../../../utils/appVersion';

const info = {
  version: '1.2.3',
  os: 'macos',
  arch: 'aarch64',
  dataDir: '/data',
  logDir: '/logs',
};

/** A button that opens About (as the menu bar and the palette do), and where the app went. */
function Opener() {
  const { openAbout } = useAbout();
  const { view, params } = useNavigation();
  return (
    <>
      <button type="button" onClick={() => openAbout()}>
        Open About
      </button>
      <button type="button" onClick={() => openAbout({ checkForUpdates: true })}>
        Check for Updates…
      </button>
      <output aria-label="where">{`${view} ${JSON.stringify(params)}`}</output>
    </>
  );
}

const updatesSlot = vi.fn(({ checkRequest }: { checkRequest: number }) => <p>Update check {checkRequest}</p>);

function renderAbout(withUpdates = false) {
  return render(
    <AppExtensionsProvider value={withUpdates ? { AboutUpdates: updatesSlot } : {}}>
      <NavigationProvider>
        <AboutProvider>
          <Opener />
        </AboutProvider>
      </NavigationProvider>
    </AppExtensionsProvider>
  );
}

const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open About' }));
  return within(await screen.findByRole('dialog', { name: 'TaskMint' }));
};

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  updatesSlot.mockClear();
});

afterEach(() => setCloudSyncForTest(null));

describe('diagnostics', () => {
  it('lists what a problem report needs', () => {
    expect(diagnostics({ version: '4.4.0', runtime: 'desktop', info, sync: 'Synced', userAgent: 'UA' })).toBe(
      [
        'TaskMint 4.4.0 (desktop)',
        'System: macos aarch64',
        'Data folder: /data',
        'Logs: /logs',
        'Cloud sync: Synced',
        'User agent: UA',
      ].join('\n')
    );
    expect(diagnostics({ version: '4.4.0', runtime: 'web', info: null, sync: null, userAgent: 'UA' })).toBe(
      'TaskMint 4.4.0 (web)\nUser agent: UA'
    );
    expect(
      diagnostics({ version: '4.4.0', runtime: 'mobile', info: { ...info, logDir: null }, sync: null, userAgent: 'UA' })
    ).not.toContain('Logs:');
  });
});

describe('About TaskMint', () => {
  it('says which version this is and when it was released', async () => {
    renderAbout();
    const dialog = await open();
    expect(dialog.getByRole('heading', { name: 'TaskMint' })).toBeInTheDocument();
    expect(
      dialog.getByText(new RegExp(`^Version ${APP_VERSION.replace(/\./g, '\\.')} · Released`))
    ).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it("opens TaskMint's pages and folders, and says when one couldn't open", async () => {
    const { platform } = fakeBackend();
    renderAbout();
    const dialog = await open();
    fireEvent.click(dialog.getByRole('button', { name: 'TaskMint on GitHub' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Report a problem' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Show data folder' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Show logs folder' }));
    expect(platform.openLink.mock.calls).toEqual([['repository'], ['issues']]);
    expect(platform.openFolder.mock.calls).toEqual([['data'], ['logs']]);

    platform.openFolder.mockRejectedValueOnce('No such folder');
    fireEvent.click(dialog.getByRole('button', { name: 'Show logs folder' }));
    expect(await screen.findByText("Couldn't open the folder: No such folder")).toBeInTheDocument();
    platform.openLink.mockRejectedValueOnce('No browser');
    fireEvent.click(dialog.getByRole('button', { name: 'Report a problem' }));
    expect(await screen.findByText("Couldn't open the page: No browser")).toBeInTheDocument();
  });

  it('copies diagnostics, with where sync stands but never the account', async () => {
    const store = createFakeCloudStore();
    store.setEpoch('bea', 1);
    const engine = new SyncEngine(
      asBackend(syncHost({ account: { uid: 'bea', epoch: 1 } }).backend),
      async () => store,
      {
        sendDelayMs: 1,
        retryMs: 10_000,
        publishDelayMs: 1,
        publishRetryMs: 10_000,
      }
    );
    setCloudSyncForTest(engine);
    await engine.start();
    store.setUser(bea());
    await vi.waitFor(() => expect(engine.getView().phase).toBe('synced'));
    fakeBackend().platform.appInfo.mockResolvedValue(info);

    renderAbout();
    const dialog = await open();
    await waitFor(() => expect(fakeBackend().platform.appInfo).toHaveBeenCalled());
    fireEvent.click(dialog.getByRole('button', { name: 'Copy diagnostics' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('Data folder: /data');
    expect(copied).toContain('Cloud sync: Synced');
    expect(copied).not.toContain('bea@example.com');
    expect(await screen.findByText('Copied the diagnostics. Paste them into your problem report.')).toBeInTheDocument();

    writeText.mockRejectedValueOnce('Not allowed');
    fireEvent.click(dialog.getByRole('button', { name: 'Copy diagnostics' }));
    expect(await screen.findByText("Couldn't copy the diagnostics: Not allowed")).toBeInTheDocument();
  });

  it("leaves out what the shell can't do, and copies what it knows", async () => {
    installFakeBackendForTest({ capabilities: { runtime: 'web' }, without: ['appInfo', 'openLink', 'openFolder'] });
    renderAbout();
    const dialog = await open();
    expect(dialog.queryByRole('button', { name: 'TaskMint on GitHub' })).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Show data folder' })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Copy diagnostics' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toMatch(/^TaskMint .+ \(web\)\nUser agent: /);
  });

  it("copies without the folders when the shell couldn't say", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeBackend().platform.appInfo.mockRejectedValueOnce('IPC down');
    renderAbout();
    const dialog = await open();
    await waitFor(() => expect(warn).toHaveBeenCalledWith('Failed to read the app info:', 'IPC down'));
    fireEvent.click(dialog.getByRole('button', { name: 'Copy diagnostics' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).not.toContain('Data folder');
    warn.mockRestore();
  });

  it("opens What's new in Settings", async () => {
    renderAbout();
    const dialog = await open();
    fireEvent.click(dialog.getByRole('button', { name: "What's new" }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status', { name: 'where' })).toHaveTextContent('settings {"section":"about"}');
  });

  it("shows the shell's update status, checking each time it's asked to", async () => {
    renderAbout(true);
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates…' }));
    expect(await screen.findByText('Update check 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates…', hidden: true }));
    expect(await screen.findByText('Update check 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open About', hidden: true }));
    expect(screen.getByText('Update check 2')).toBeInTheDocument();

    // Closed and opened again: no check unless asked
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open About' }));
    expect(await screen.findByText('Update check 0')).toBeInTheDocument();
  });

  it('needs its provider, except where it can do without', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAbout())).toThrow(/AboutProvider/);
    expect(renderHook(() => useOptionalAbout()).result.current).toBeNull();
  });
});
