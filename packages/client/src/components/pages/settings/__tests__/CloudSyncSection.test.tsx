import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudSyncSection } from '../CloudSyncSection';
import { SyncEngine, setCloudSyncForTest } from '../../../../cloud';
import { asBackend, bea, createFakeCloudStore, type FakeCloudStore } from '../../../../testing';
import { syncHost } from '../../../../cloud/__tests__/syncHost';

const OPTIONS = { sendDelayMs: 1, retryMs: 10_000 };

afterEach(() => setCloudSyncForTest(null));

/** The section on a real engine, over a fake cloud and a scripted backend. */
async function shown(
  host = syncHost(),
  store: FakeCloudStore = createFakeCloudStore(),
  load = async () => store,
  google: (() => Promise<string | null>) | null = null
) {
  const engine = new SyncEngine(asBackend(host.backend), load, OPTIONS, google);
  setCloudSyncForTest(engine);
  render(<CloudSyncSection />);
  await act(() => engine.start());
  return { engine, host, store, user: userEvent.setup() };
}

describe('Settings → Cloud sync, signed out', () => {
  it('signs in with an email and password, and says why one was refused', async () => {
    const { store, user } = await shown();
    expect(screen.getByText(/Without it, everything stays on this device/)).toBeInTheDocument();
    vi.mocked(store.signIn).mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    await user.type(screen.getByLabelText('Email'), ' bea@example.com ');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That email and password don’t match an account.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(store.signIn).toHaveBeenLastCalledWith('bea@example.com', 'secret');
    expect(await screen.findByText('Signed in as bea@example.com')).toBeInTheDocument();
  });

  it('signs in with Google where the build can, and says why it was refused', async () => {
    const { store, user } = await shown(syncHost(), createFakeCloudStore(), undefined, async () => 'token');
    vi.mocked(store.signInWithGoogle).mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Google sign-in was closed before it finished.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(store.signInWithGoogle).toHaveBeenLastCalledWith('token');
    expect(await screen.findByText('Signed in as bea@example.com')).toBeInTheDocument();
  });

  it('leaves Google out where the build has no way to it, and while sending a reset link', async () => {
    const { user } = await shown(syncHost(), createFakeCloudStore(), undefined, async () => null);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
    setCloudSyncForTest(null);
    document.body.innerHTML = '';
    await shown();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('makes an account, or sends a reset link, and goes back to signing in', async () => {
    const { store, user } = await shown();
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'bea@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(
      await screen.findByText('If bea@example.com has an account, a reset link is on its way.')
    ).toBeInTheDocument();
    expect(store.resetPassword).toHaveBeenCalledWith('bea@example.com');

    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.queryByText(/a reset link is on its way/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    await user.click(screen.getByRole('button', { name: 'I have an account' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByLabelText('Password'), 'longer-secret');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(store.signUp).toHaveBeenCalledWith('bea@example.com', 'longer-secret');
    expect(await screen.findByText('Signed in as bea@example.com')).toBeInTheDocument();
  });

  it('says when sync couldn’t start, and while it connects', async () => {
    await shown(syncHost(), createFakeCloudStore(), () => Promise.reject(new Error('offline')));
    expect(screen.getByText("Cloud sync couldn't start: offline")).toBeInTheDocument();
    setCloudSyncForTest(null);

    const engine = new SyncEngine(asBackend(syncHost().backend), () => new Promise(() => {}), OPTIONS);
    setCloudSyncForTest(engine);
    render(<CloudSyncSection />);
    expect(screen.getAllByText('Connecting…')).not.toHaveLength(0);
  });
});

describe('Settings → Cloud sync, signed in', () => {
  async function signedIn(host = syncHost({ account: { uid: 'bea', epoch: 1 } })) {
    const store = createFakeCloudStore();
    store.setEpoch('bea', 1);
    const shownSection = await shown(host, store);
    act(() => store.setUser(bea()));
    await screen.findByText('Signed in as bea@example.com');
    return shownSection;
  }

  it('shows whether it’s up to date, and syncs now', async () => {
    const host = syncHost({ account: { uid: 'bea', epoch: 1 }, held: 1 });
    const { user, store } = await signedIn(host);
    await waitFor(() => expect(screen.getByText('Up to date')).toBeInTheDocument());
    expect(screen.getByText(/saved by a newer version of TaskMint/)).toBeInTheDocument();

    host.state.outgoing = [{ docId: 'session~a', kind: 'session', id: 'a', json: '{}', hash: 'h' }];
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('1 change to send')).toBeInTheDocument();
    expect(store.writes).toHaveLength(1);
    host.state.outgoing.push({ docId: 'session~b', kind: 'session', id: 'b', json: '{}', hash: 'h' });
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('2 changes to send')).toBeInTheDocument();
  });

  it('says what went wrong, and tries again', async () => {
    const { store, user } = await signedIn();
    act(() => store.emitError({ code: 'permission-denied' }));
    expect(await screen.findByText('The cloud refused this device’s data. Sign out and in again.')).toBeInTheDocument();
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
  });

  it('stops syncing this device once confirmed', async () => {
    const { host, user } = await signedIn();
    await user.click(screen.getByRole('button', { name: 'Stop syncing' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/This device keeps its data and signs out/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stop syncing' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(host.state.account).toBeNull();
  });

  it('deletes the cloud data once confirmed, says so, and syncs again', async () => {
    const { store, host, user } = await signedIn();
    vi.mocked(store.deleteAll).mockRejectedValueOnce({ code: 'unavailable' });
    await user.click(screen.getByRole('button', { name: 'Delete cloud data' }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete cloud data' }));
    expect(await screen.findByText('Can’t reach the cloud. Changes will sync once it’s back.')).toBeInTheDocument();
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete cloud data' }));
    expect(
      await screen.findByText('The cloud data was deleted, so this device stopped syncing. Its data is still here.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sync again' }));
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
    expect(host.state.account).toEqual({ uid: 'bea', epoch: 2 });
  });

  it('asks how to join two sets of data', async () => {
    for (const choice of ['Merge them', 'Replace'] as const) {
      const store = createFakeCloudStore();
      store.setEpoch('bea', 1);
      store.setHasData('bea', true);
      const host = syncHost({ hasData: true });
      const { user } = await shown(host, store);
      act(() => store.setUser(bea()));
      expect(await screen.findByText(/This device and your cloud account both have data/)).toBeInTheDocument();
      if (choice === 'Replace') {
        await user.click(screen.getByRole('button', { name: "Use the cloud's data" }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/A copy of them is kept/)).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
      } else {
        await user.click(screen.getByRole('button', { name: 'Merge them' }));
      }
      expect(await screen.findByText('Up to date')).toBeInTheDocument();
      expect(host.state.linkedWith).toBe(choice === 'Replace' ? 'replace' : 'merge');
      setCloudSyncForTest(null);
      document.body.innerHTML = '';
    }
  });

  it('signs out instead of choosing, or of switching accounts', async () => {
    const store = createFakeCloudStore();
    store.setEpoch('bea', 1);
    store.setHasData('bea', true);
    const { user } = await shown(syncHost({ hasData: true }), store);
    act(() => store.setUser(bea()));
    await screen.findByText(/both have data/);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    setCloudSyncForTest(null);
    document.body.innerHTML = '';

    const other = syncHost({ account: { uid: 'cal', epoch: 1 } });
    const next = await shown(other);
    act(() => next.store.setUser(bea()));
    expect(await screen.findByText(/This device syncs with a different account/)).toBeInTheDocument();
    await next.user.click(screen.getByRole('button', { name: 'Sync with bea@example.com' }));
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
    expect(other.state.account).toEqual({ uid: 'bea', epoch: 1 });
    await next.user.click(screen.getByRole('button', { name: 'Stop syncing' }));
    await next.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stop syncing' }));
    await screen.findByRole('button', { name: 'Sign in' });
  });

  it('signs out from a notice', async () => {
    const { store, user } = await signedIn();
    act(() => store.setEpoch('bea', 7));
    await screen.findByText(/The cloud data was deleted/);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
