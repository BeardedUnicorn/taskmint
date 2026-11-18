import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EVENTS, type OutgoingDoc } from '@taskmint/contracts';
import { setCloudSyncForTest, SyncEngine } from '@taskmint/client/cloud';
import { asBackend, bea, createFakeBackend, createFakeCloudStore } from '@taskmint/client/testing';
import { AccountSection, SAVE_WAIT_MS } from '../settings/AccountSection';
import { webExtensions } from '../settings/extensions';

afterEach(() => {
  setCloudSyncForTest(null);
  vi.useRealTimers();
});

const change: OutgoingDoc = { docId: 'session~s1', kind: 'session', id: 's1', json: '{}', hash: 'h1' };

/** A signed-in engine over a fake cloud and a backend answering sync's commands. */
async function signedIn() {
  const store = createFakeCloudStore();
  store.setEpoch('bea', 1);
  store.setUser(bea());
  const backend = createFakeBackend({ capabilities: { runtime: 'web', dataLocation: 'cloud' } });
  /** What the page has that the cloud doesn't yet. */
  const page = { outgoing: [] as OutgoingDoc[] };
  const status = {
    account: { uid: 'bea', epoch: 1 },
    deviceId: 'tab',
    cursor: null,
    pending: 0,
    held: 0,
    hasData: false,
  };
  backend.call.mockImplementation(async (command: string) =>
    command === 'get_sync_outgoing' ? page.outgoing : status
  );
  const engine = new SyncEngine(asBackend(backend), async () => store);
  setCloudSyncForTest(engine);
  await engine.start();
  await vi.waitFor(() => expect(engine.getView().phase).toBe('synced'));
  /** A change just made: sync sends it a second later. */
  const makeChange = () => {
    page.outgoing = [change];
    backend.emit(EVENTS.SYNC_PENDING);
  };
  return { store, engine, makeChange };
}

describe('Settings → Account', () => {
  it('shows who is signed in, and signs out', async () => {
    const { store } = await signedIn();
    render(<AccountSection />);
    expect(screen.getByText('Signed in as bea@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(store.signOut).toHaveBeenCalled();
  });

  it('sends the changes still waiting to the account before signing out', async () => {
    const { store, makeChange } = await signedIn();
    render(<AccountSection />);
    makeChange();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => expect(store.signOut).toHaveBeenCalled());
    expect(store.writes.map(write => write.docs)).toEqual([[change]]);
    expect(vi.mocked(store.write).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(store.signOut).mock.invocationCallOrder[0]
    );
  });

  it('asks before signing out without changes the cloud did not take', async () => {
    const { store, makeChange } = await signedIn();
    render(<AccountSection />);
    makeChange();
    vi.mocked(store.write).mockRejectedValue({ code: 'unavailable' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Your latest changes haven’t reached your account');
    expect(dialog).toHaveTextContent('Can’t reach the cloud.');
    expect(store.signOut).not.toHaveBeenCalled();

    // Staying keeps them, to try again
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay signed in' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store.signOut).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out anyway' }));
    await vi.waitFor(() => expect(store.signOut).toHaveBeenCalledTimes(1));
  });

  it('asks rather than wait for a cloud that does not answer', async () => {
    const { store, makeChange } = await signedIn();
    render(<AccountSection />);
    makeChange();
    vi.mocked(store.write).mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await act(() => vi.advanceTimersByTimeAsync(SAVE_WAIT_MS - 1));
    expect(screen.getByRole('button', { name: 'Saving your changes…' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole('dialog')).toHaveTextContent('The cloud isn’t answering.');
    expect(screen.getByRole('button', { name: 'Sign out', hidden: true })).toBeEnabled();
    expect(store.signOut).not.toHaveBeenCalled();
  });

  it('says why signing out failed', async () => {
    const { store } = await signedIn();
    render(<AccountSection />);
    vi.mocked(store.signOut).mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/Can’t reach Firebase/)).toBeInTheDocument();
  });

  it('emails a link for a new password, and says why it could not', async () => {
    const { store } = await signedIn();
    render(<AccountSection />);
    vi.mocked(store.resetPassword).mockRejectedValueOnce({ code: 'auth/too-many-requests' });
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Too many tries/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByText('A link to set a new password is on its way to bea@example.com.')
    ).toBeInTheDocument();
    expect(store.resetPassword).toHaveBeenLastCalledWith('bea@example.com');
  });

  it('deletes the account once confirmed, and says why it could not', async () => {
    const { store } = await signedIn();
    render(<AccountSection />);
    vi.mocked(store.deleteUser).mockRejectedValueOnce({ code: 'auth/requires-recent-login' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText(/Sign in again first/)).toBeInTheDocument();
    expect(store.deleteAll).toHaveBeenCalledWith('bea', 1);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }));
    await vi.waitFor(() => expect(store.deleteUser).toHaveBeenCalledTimes(2));
  });

  it('shows no address before the user is known', async () => {
    const store = createFakeCloudStore();
    const engine = new SyncEngine(asBackend(createFakeBackend()), async () => store);
    setCloudSyncForTest(engine);
    render(<AccountSection />);
    expect(screen.getByText('Signed in as')).toBeInTheDocument();
  });
});

describe("the web app's extensions", () => {
  it('sign out when the data cannot be opened', async () => {
    const { store } = await signedIn();
    const Actions = webExtensions().StartupErrorActions!;
    render(<Actions />);
    await act(() => userEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(store.signOut).toHaveBeenCalled();
    setCloudSyncForTest(null);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  });
});
