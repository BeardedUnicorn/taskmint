import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startClient } from '@taskmint/client/start';
import { start } from '../start';

vi.mock('@taskmint/client/start', () => ({ startClient: vi.fn(async () => undefined) }));
vi.mock('@taskmint/client/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@taskmint/client/ui')>()),
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

/** The page at `path`, recording where it's sent. */
function page(path: string) {
  const url = new URL(path, 'http://localhost:8080');
  return { pathname: url.pathname, search: url.search, assign: vi.fn(), reload: vi.fn() };
}

function container() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return element;
}

/** Answers every request with `status` and `body`. */
function serverAnswers(status: number, body: unknown) {
  const fetch = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const me = {
  user: { id: 'u1', username: 'alice', displayName: '', role: 'user', timeZone: 'UTC' },
  csrfToken: 'csrf-1',
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  // The pages start renders aren't Testing Library's to clean up
  document.body.replaceChildren();
});

describe('the web app', () => {
  it('starts the app against the server once signed in', async () => {
    const fetch = serverAnswers(200, me);
    const here = page('/');

    await act(() => start(container(), here));

    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/me', expect.objectContaining({ method: 'GET' }));
    const [, options] = vi.mocked(startClient).mock.calls[0];
    expect(options.backend.capabilities).toEqual({ runtime: 'web', dataLocation: 'server' });
    expect(options.importLegacyRecords).toBe(false);
    expect(options.extensions.settingsSections!.map(section => section.id)).toEqual(['account', 'tokens']);

    // The session's requests carry its CSRF token, and one refused sends the page to sign in
    serverAnswers(401, { error: 'sign in first', code: 'unauthenticated' });
    await expect(options.backend.call('get_sessions')).rejects.toBe('sign in first');
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
    expect(here.assign).toHaveBeenCalledWith('/login');
  });

  it('signs out to the sign-in page', async () => {
    serverAnswers(200, { ...me, csrfToken: null });
    const here = page('/');
    await act(() => start(container(), here));
    const { settingsSections } = vi.mocked(startClient).mock.calls[0][1].extensions;

    serverAnswers(204, '');
    const Account = settingsSections![0].Section;
    render(<Account />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(here.assign).toHaveBeenCalledWith('/login');
  });

  it('sends a signed-out browser to sign in, and back afterwards', async () => {
    serverAnswers(401, { error: 'sign in first', code: 'unauthenticated' });
    const here = page('/somewhere?x=1');
    await act(() => start(container(), here));
    expect(here.assign).toHaveBeenCalledWith('/login?next=%2Fsomewhere%3Fx%3D1');
    expect(startClient).not.toHaveBeenCalled();
  });

  it("says when the server can't be reached, and tries again", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const here = page('/');
    await act(() => start(container(), here));

    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the TaskMint server");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(here.reload).toHaveBeenCalled();
  });

  it('shows the sign-in page, and goes where it was asked to', async () => {
    serverAnswers(200, me);
    const here = page('/login?next=%2Fhistory');
    await act(() => start(container(), here));

    await userEvent.type(screen.getByLabelText(/Username/), 'alice');
    await userEvent.type(screen.getByLabelText(/Password/), 'correct horse battery{Enter}');
    await vi.waitFor(() => expect(here.assign).toHaveBeenCalledWith('/history'));
  });

  it('opens invite and reset links into the app', async () => {
    serverAnswers(404, { error: 'this invite link is invalid, used, or expired', code: 'not_found' });
    await act(() => start(container(), page('/invite/abc')));
    expect(await screen.findByRole('heading', { name: 'Join TaskMint' })).toBeInTheDocument();

    const reset = page('/reset/r1');
    serverAnswers(200, { username: 'alice', expiresAt: '2026-11-01T00:00:00Z' });
    await act(() => start(container(), reset));
    expect(await screen.findByText('alice')).toBeInTheDocument();
    serverAnswers(200, me);
    for (const field of [/^New password/, /Confirm password/]) {
      await userEvent.type(screen.getByLabelText(field), 'correct horse battery');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await vi.waitFor(() => expect(reset.assign).toHaveBeenCalledWith('/'));
  });

  it("reads the browser's own location by default", async () => {
    window.history.pushState({}, '', '/login');
    await act(() => start(container()));
    expect(screen.getByRole('heading', { name: 'Sign in to TaskMint' })).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });
});
