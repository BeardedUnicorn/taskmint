import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setCloudSyncForTest, SyncEngine } from '@taskmint/client/cloud';
import { asBackend, bea, createFakeBackend, createFakeCloudStore } from '@taskmint/client/testing';
import { AccountSection } from '../settings/AccountSection';
import { webExtensions } from '../settings/extensions';

afterEach(() => setCloudSyncForTest(null));

/** A signed-in engine over a fake cloud and a backend answering sync's commands. */
async function signedIn() {
  const store = createFakeCloudStore();
  store.setEpoch('bea', 1);
  store.setUser(bea());
  const backend = createFakeBackend({ capabilities: { runtime: 'web', dataLocation: 'cloud' } });
  const status = {
    account: { uid: 'bea', epoch: 1 },
    deviceId: 'tab',
    cursor: null,
    pending: 0,
    held: 0,
    hasData: false,
  };
  backend.call.mockImplementation(async (command: string) => (command === 'get_sync_outgoing' ? [] : status));
  const engine = new SyncEngine(asBackend(backend), async () => store);
  setCloudSyncForTest(engine);
  await engine.start();
  await vi.waitFor(() => expect(engine.getView().phase).toBe('synced'));
  return { store, engine };
}

describe('Settings → Account', () => {
  it('shows who is signed in, and signs out', async () => {
    const { store } = await signedIn();
    render(<AccountSection />);
    expect(screen.getByText('Signed in as bea@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(store.signOut).toHaveBeenCalled();
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
