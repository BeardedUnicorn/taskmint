import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../auth/LoginPage';
import { InvitePage } from '../auth/InvitePage';
import { ResetPage } from '../auth/ResetPage';
import { passwordProblem } from '../auth/PasswordFields';
import { failure, fakeServer } from './fakes';

const GOOD = 'correct horse battery';

describe('signing in', () => {
  it('goes on once the server takes the password', async () => {
    const server = fakeServer({ 'POST /auth/login': () => ({ user: {}, csrfToken: 'c' }) });
    const onSignedIn = vi.fn();
    render(<LoginPage server={server} onSignedIn={onSignedIn} />);
    const signIn = screen.getByRole('button', { name: 'Sign in' });
    expect(signIn).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Username/), 'alice');
    await userEvent.type(screen.getByLabelText(/Password/), GOOD);
    await userEvent.click(signIn);

    expect(server.request).toHaveBeenCalledWith('POST', '/auth/login', { username: 'alice', password: GOOD });
    expect(onSignedIn).toHaveBeenCalled();
  });

  it('says why it was refused, and lets the user try again', async () => {
    const server = fakeServer({ 'POST /auth/login': () => failure(401, 'bad_credentials', 'wrong username or password') });
    const onSignedIn = vi.fn();
    render(<LoginPage server={server} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText(/Username/), 'alice');
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe('a new password', () => {
  it('is long enough and typed the same twice', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 8 characters.');
    expect(passwordProblem(GOOD, 'different')).toBe("The passwords don't match.");
    expect(passwordProblem(GOOD, GOOD)).toBeNull();
  });
});

async function fillPasswords(first: string, second = first) {
  await userEvent.type(screen.getByLabelText(/^(New password|Password)/), first);
  await userEvent.type(screen.getByLabelText(/Confirm password/), second);
}

describe('an invite link', () => {
  const invite = { role: 'user', expiresAt: '2026-11-01T12:00:00Z' };

  it('creates the account and signs it in', async () => {
    const server = fakeServer({
      'GET /invites/a%2Fb': () => invite,
      'POST /invites/a%2Fb/accept': () => ({ user: {}, csrfToken: 'c' }),
    });
    const onSignedIn = vi.fn();
    render(<InvitePage server={server} token="a/b" onSignedIn={onSignedIn} />);
    expect(screen.getByLabelText('Checking the link')).toBeInTheDocument();

    expect(await screen.findByText(/You're invited to track your time here/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Username/), 'bob');
    await userEvent.type(screen.getByLabelText(/Your name/), 'Bob');
    await fillPasswords(GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(server.request).toHaveBeenLastCalledWith('POST', '/invites/a%2Fb/accept', {
      username: 'bob',
      password: GOOD,
      displayName: 'Bob',
    });
    expect(onSignedIn).toHaveBeenCalled();
  });

  it("says so for an admin's invite, and checks the password first", async () => {
    const server = fakeServer({
      'GET /invites/t': () => ({ ...invite, role: 'admin' }),
      'POST /invites/t/accept': () => failure(409, 'username_taken', 'that username is taken'),
    });
    render(<InvitePage server={server} token="t" onSignedIn={vi.fn()} />);
    expect(await screen.findByText(/You're invited as an admin/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Username/), 'root');
    await fillPasswords(GOOD, 'other');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent("The passwords don't match.");
    expect(server.request).toHaveBeenCalledTimes(1);

    await userEvent.clear(screen.getByLabelText(/Confirm password/));
    await userEvent.type(screen.getByLabelText(/Confirm password/), GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That username is taken.')).toBeInTheDocument();
  });

  it("says when it can't be used", async () => {
    const server = fakeServer({
      'GET /invites/old': () => failure(404, 'not_found', 'this invite link is invalid, used, or expired'),
    });
    render(<InvitePage server={server} token="old" onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invite link is invalid, used, or expired. Ask your TaskMint admin for a new link.'
    );
  });
});

describe('a password-reset link', () => {
  it('sets the new password and signs in', async () => {
    const server = fakeServer({
      'GET /password-resets/r': () => ({ username: 'alice', expiresAt: '2026-11-01T12:00:00Z' }),
      'POST /password-resets/r/accept': () => ({ user: {}, csrfToken: 'c' }),
    });
    const onSignedIn = vi.fn();
    render(<ResetPage server={server} token="r" onSignedIn={onSignedIn} />);
    expect(await screen.findByText('alice')).toBeInTheDocument();

    await fillPasswords('short');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.');

    await userEvent.clear(screen.getByLabelText(/^New password/));
    await userEvent.clear(screen.getByLabelText(/Confirm password/));
    await fillPasswords(GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(server.request).toHaveBeenLastCalledWith('POST', '/password-resets/r/accept', { password: GOOD });
  });

  it('says why it was refused', async () => {
    const server = fakeServer({
      'GET /password-resets/r': () => ({ username: 'alice', expiresAt: '2026-11-01T12:00:00Z' }),
      'POST /password-resets/r/accept': () => failure(404, 'not_found', 'this password-reset link is invalid, used, or expired'),
    });
    render(<ResetPage server={server} token="r" onSignedIn={vi.fn()} />);
    await screen.findByText('alice');
    await fillPasswords(GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This password-reset link is invalid, used, or expired.');
    expect(screen.getByRole('button', { name: 'Set password' })).toBeEnabled();
  });
});
