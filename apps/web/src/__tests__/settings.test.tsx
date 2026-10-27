import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountSection } from '../settings/AccountSection';
import { TokensSection } from '../settings/TokensSection';
import { UsersSection } from '../settings/UsersSection';
import { InvitesSection } from '../settings/InvitesSection';
import { webExtensions } from '../settings/extensions';
import { CopyField } from '../settings/CopyField';
import { shortDate, type WebSession } from '../session';
import type { User } from '../types';
import { failure, fakeServer, type FakeServer } from './fakes';

const notifications = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@taskmint/client/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@taskmint/client/ui')>()),
  useNotification: () => notifications,
}));

const alice: User = { id: 'u1', username: 'alice', displayName: '', role: 'user', timeZone: 'UTC' };
const root: User = { ...alice, id: 'u0', username: 'root', displayName: 'Root', role: 'admin' };

function sessionOf(user: User, server: FakeServer): WebSession & { navigate: Mock<(path: string) => void> } {
  return { user, server, navigate: vi.fn<(path: string) => void>() };
}

const GOOD = 'correct horse battery';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a value to copy', () => {
  it('selects itself when focused, and says when copying fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    render(<CopyField label="Link" value="http://localhost:8080/invite/x" />);
    const field = screen.getByLabelText('Link') as HTMLInputElement;
    act(() => field.focus());
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(notifications.showError).toHaveBeenCalledWith("Couldn't copy it: select it and copy it yourself.");
  });
});

describe('dates', () => {
  it('read as dates, or never', () => {
    expect(shortDate(null)).toBe('Never');
    expect(shortDate('2026-10-01T12:00:00Z')).toBe(new Date('2026-10-01T12:00:00Z').toLocaleDateString());
  });
});

describe('the web Settings sections', () => {
  it('are the account and tokens, plus users and invites for admins', async () => {
    const names = (user: User) => webExtensions(sessionOf(user, fakeServer())).settingsSections!.map(s => s.id);
    expect(names(alice)).toEqual(['account', 'tokens']);
    expect(names(root)).toEqual(['account', 'tokens', 'users', 'invites']);

    const sections = webExtensions(sessionOf(root, fakeServer())).settingsSections!;
    for (const { Section } of sections) render(<Section />);
    for (const title of ['Account', 'API tokens', 'Users', 'Invites']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    // The lists it reads (this server has none)
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
  });
});

describe('Account', () => {
  it('shows who is signed in, and signs out', async () => {
    const server = fakeServer({ 'POST /auth/logout': () => undefined });
    const session = sessionOf(root, server);
    render(<AccountSection session={session} />);
    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Signed in as Root (root)');
    expect(screen.getByText('Admin')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.navigate).toHaveBeenCalledWith('/login');
  });

  it("stays when signing out fails", async () => {
    const server = fakeServer({ 'POST /auth/logout': () => failure(0, 'unreachable', "Can't reach the TaskMint server.") });
    const session = sessionOf(alice, server);
    render(<AccountSection session={session} />);
    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Signed in as alice');

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(notifications.showError).toHaveBeenCalledWith("Can't reach the TaskMint server.");
    expect(session.navigate).not.toHaveBeenCalled();
  });

  it('changes the password', async () => {
    let refuse = true;
    const server = fakeServer({
      'POST /auth/password': () => (refuse ? failure(403, 'wrong_password', 'the current password is wrong') : undefined),
    });
    render(<AccountSection session={sessionOf(alice, server)} />);
    const change = screen.getByRole('button', { name: 'Change password' });
    expect(change).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Current password/), 'old password');
    await userEvent.type(screen.getByLabelText(/^New password/), 'short');
    await userEvent.type(screen.getByLabelText(/Confirm password/), 'short');
    await userEvent.click(change);
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.');

    await userEvent.clear(screen.getByLabelText(/^New password/));
    await userEvent.clear(screen.getByLabelText(/Confirm password/));
    await userEvent.type(screen.getByLabelText(/^New password/), GOOD);
    await userEvent.type(screen.getByLabelText(/Confirm password/), GOOD);
    await userEvent.click(change);
    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is wrong.');

    refuse = false;
    await userEvent.click(change);
    await waitFor(() =>
      expect(notifications.showSuccess).toHaveBeenCalledWith('Password changed. Every other device was signed out.')
    );
    expect(server.request).toHaveBeenLastCalledWith('POST', '/auth/password', {
      currentPassword: 'old password',
      newPassword: GOOD,
    });
    expect(screen.getByLabelText(/Current password/)).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

const token = (id: string, overrides = {}) => ({
  id,
  name: `Token ${id}`,
  scope: 'capture',
  kind: 'api',
  prefix: `tmk_${id}`,
  createdAt: '2026-10-01T12:00:00Z',
  lastUsedAt: null,
  ...overrides,
});

describe('API tokens', () => {
  it('lists them, and makes one whose secret shows once', async () => {
    let tokens = [token('a'), token('d', { kind: 'device', scope: 'full', lastUsedAt: '2026-10-02T12:00:00Z' })];
    const server = fakeServer({
      'GET /tokens': () => tokens,
      'POST /tokens': body => {
        tokens = [...tokens, token('n', body as object)];
        return { ...token('n', body as object), token: 'tmk_secret' };
      },
    });
    const clipboard = { writeText: vi.fn(async () => undefined) };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
    render(<TokensSection session={sessionOf(alice, server)} />);

    const list = await screen.findByRole('list', { name: 'API tokens' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Desktop app')).toBeInTheDocument();
    expect(within(list).getByText('Full access')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Laptop');
    await userEvent.click(screen.getByLabelText('Access'));
    await userEvent.click(screen.getByRole('option', { name: /Full access/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }));

    const dialog = await screen.findByRole('dialog', { name: 'Token "Laptop" created' });
    expect(within(dialog).getByLabelText('Token')).toHaveValue('tmk_secret');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy token' }));
    expect(clipboard.writeText).toHaveBeenCalledWith('tmk_secret');
    expect(notifications.showSuccess).toHaveBeenCalledWith('Copied');
    expect(server.request).toHaveBeenCalledWith('POST', '/tokens', { name: 'Laptop', scope: 'full' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
  });

  it('says when copying fails, or making one does', async () => {
    const server = fakeServer({
      'GET /tokens': () => [],
      'POST /tokens': () => failure(400, 'invalid_request', 'a token name is 1-100 characters'),
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    render(<TokensSection session={sessionOf(alice, server)} />);
    expect(await screen.findByText('No tokens yet.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(notifications.showError).toHaveBeenCalledWith('A token name is 1-100 characters.');
  });

  it('revokes one, after asking', async () => {
    let tokens = [token('a')];
    let refuse = true;
    const server = fakeServer({
      'GET /tokens': () => tokens,
      'DELETE /tokens/a': () => {
        if (refuse) failure(404, 'not_found', 'no such token');
        tokens = [];
      },
    });
    render(<TokensSection session={sessionOf(alice, server)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    const confirm = await screen.findByRole('dialog', { name: 'Revoke "Token a"?' });

    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));
    expect(notifications.showError).toHaveBeenCalledWith('No such token.');

    refuse = false;
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(notifications.showSuccess).toHaveBeenCalledWith('Revoked "Token a"'));
    expect(await screen.findByText('No tokens yet.')).toBeInTheDocument();
  });

  it("says when the list can't be read", async () => {
    const server = fakeServer();
    render(<TokensSection session={sessionOf(alice, server)} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No route for GET /tokens.');
  });
});

const member = (id: string, overrides = {}) => ({
  id,
  username: `user${id}`,
  displayName: '',
  role: 'user',
  createdAt: '2026-10-01T12:00:00Z',
  disabledAt: null,
  lastSeenAt: null,
  ...overrides,
});

describe('Users', () => {
  it("lists every account, and changes one's role", async () => {
    let users = [member('0', { id: root.id, username: 'root', displayName: 'Root', role: 'admin' }), member('1')];
    const server = fakeServer({
      'GET /admin/users': () => users,
      'PATCH /admin/users/1': body => {
        users = users.map(u => (u.id === '1' ? { ...u, ...(body as object) } : u));
      },
    });
    render(<UsersSection session={sessionOf(root, server)} />);
    const list = await screen.findByRole('list', { name: 'Users' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(within(first).getByText('You')).toBeInTheDocument();
    expect(within(first).getByText('root')).toBeInTheDocument();

    await userEvent.click(within(second).getByLabelText('Role'));
    await userEvent.click(screen.getByRole('option', { name: 'Admin' }));
    await waitFor(() => expect(notifications.showSuccess).toHaveBeenCalledWith('user1 is now a admin'));
    expect(server.request).toHaveBeenCalledWith('PATCH', '/admin/users/1', { role: 'admin' });
  });

  it('disables an account after asking, and enables it again', async () => {
    let users = [member('1')];
    const server = fakeServer({
      'GET /admin/users': () => users,
      'PATCH /admin/users/1': body => {
        const disabled = (body as { disabled: boolean }).disabled;
        users = [member('1', { disabledAt: disabled ? '2026-10-03T12:00:00Z' : null })];
      },
    });
    render(<UsersSection session={sessionOf(root, server)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    const confirm = await screen.findByRole('dialog', { name: 'Disable user1?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Disable' }));

    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(notifications.showSuccess).toHaveBeenCalledWith('Enabled user1'));
    expect(await screen.findByRole('button', { name: 'Disable' })).toBeInTheDocument();
  });

  it('says when a change is refused', async () => {
    const server = fakeServer({
      'GET /admin/users': () => [member('1', { disabledAt: '2026-10-03T12:00:00Z' })],
      'PATCH /admin/users/1': () => failure(409, 'last_admin', 'there must be at least one active admin'),
    });
    render(<UsersSection session={sessionOf(root, server)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }));
    await waitFor(() =>
      expect(notifications.showError).toHaveBeenCalledWith('There must be at least one active admin.')
    );
    await userEvent.click(screen.getByLabelText('Role'));
    await userEvent.click(screen.getByRole('option', { name: 'Admin' }));
    await waitFor(() => expect(notifications.showError).toHaveBeenCalledTimes(2));
  });

  it('makes a password-reset link to pass on', async () => {
    let fail = true;
    const server = fakeServer({
      'GET /admin/users': () => [member('1')],
      'POST /admin/users/1/password-reset': () =>
        fail
          ? failure(404, 'not_found', 'no active user with that id')
          : { username: 'user1', url: 'http://localhost:8080/reset/abc', expiresAt: '2026-10-04T12:00:00Z' },
    });
    render(<UsersSection session={sessionOf(root, server)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reset link' }));
    expect(notifications.showError).toHaveBeenCalledWith('No active user with that id.');

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reset link' }));
    const dialog = await screen.findByRole('dialog', { name: 'Password reset for user1' });
    expect(within(dialog).getByLabelText('Link')).toHaveValue('http://localhost:8080/reset/abc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it("says when the list can't be read", async () => {
    render(<UsersSection session={sessionOf(root, fakeServer())} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No route for GET /admin/users.');
  });
});

const invite = (id: string, overrides = {}) => ({
  id,
  role: 'user',
  note: '',
  status: 'pending',
  createdAt: '2026-10-01T12:00:00Z',
  expiresAt: '2026-10-04T12:00:00Z',
  createdBy: 'root',
  usedBy: null,
  usedAt: null,
  ...overrides,
});

describe('Invites', () => {
  it('lists them, and makes a link to send', async () => {
    let invites = [
      invite('used', { status: 'used', usedBy: 'bob', usedAt: '2026-10-02T12:00:00Z', note: 'For Bob' }),
      invite('admin', { role: 'admin' }),
      invite('plain'),
    ];
    const server = fakeServer({
      'GET /admin/invites': () => invites,
      'POST /admin/invites': body => {
        invites = [invite('new', body as object), ...invites];
        return { url: 'http://localhost:8080/invite/xyz', expiresAt: '2026-10-04T12:00:00Z' };
      },
    });
    render(<InvitesSection session={sessionOf(root, server)} />);
    const list = await screen.findByRole('list', { name: 'Invites' });
    expect(within(list).getByText('For Bob')).toBeInTheDocument();
    expect(within(list).getByText(/Used by bob/)).toBeInTheDocument();
    expect(within(list).getByText('Admin invite')).toBeInTheDocument();
    expect(within(list).getByText('Invite')).toBeInTheDocument();
    // Only a pending invite can be revoked
    expect(within(list).getAllByRole('button', { name: 'Revoke' })).toHaveLength(2);

    await userEvent.click(screen.getByLabelText('Role'));
    await userEvent.click(screen.getByRole('option', { name: 'Admin' }));
    await userEvent.type(screen.getByLabelText('Note'), 'For Carol');
    await userEvent.click(screen.getByRole('button', { name: 'Create invite' }));

    const dialog = await screen.findByRole('dialog', { name: 'Invite created' });
    expect(within(dialog).getByLabelText('Link')).toHaveValue('http://localhost:8080/invite/xyz');
    expect(server.request).toHaveBeenCalledWith('POST', '/admin/invites', { role: 'admin', note: 'For Carol' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(4));
    expect(within(list).getByText('For Carol')).toBeInTheDocument();
  });

  it('revokes a pending one', async () => {
    let invites = [invite('p')];
    let refuse = true;
    const server = fakeServer({
      'GET /admin/invites': () => invites,
      'DELETE /admin/invites/p': () => {
        if (refuse) failure(404, 'not_found', 'no pending invite with that id');
        invites = [];
      },
    });
    render(<InvitesSection session={sessionOf(root, server)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(notifications.showError).toHaveBeenCalledWith('No pending invite with that id.');

    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('No invites yet.')).toBeInTheDocument();
    expect(notifications.showSuccess).toHaveBeenCalledWith('Invite revoked');
  });

  it('says when one can’t be made, or the list read', async () => {
    const server = fakeServer({
      'POST /admin/invites': () => failure(400, 'invalid_request', 'a note is at most 200 characters'),
    });
    render(<InvitesSection session={sessionOf(root, server)} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No route for GET /admin/invites.');
    await userEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(notifications.showError).toHaveBeenCalledWith('A note is at most 200 characters.');
  });
});
