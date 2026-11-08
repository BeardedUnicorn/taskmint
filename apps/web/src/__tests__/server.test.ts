import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVER_API } from '@taskmint/contracts';
import { createServer, problem, sentence, ServerError, timeZone } from '../server';

function respond(status: number, body = '') {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response(body || null, { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requests to the server', () => {
  it('send JSON with the time zone, and the CSRF token on changes', async () => {
    const fetch = respond(200, '{"ok":true}');
    vi.stubGlobal('fetch', fetch);
    const server = createServer({ csrfToken: 'csrf-1' });

    expect(await server.request('POST', '/commands/start_task', { taskId: 't1' })).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/v1/commands/start_task', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        [SERVER_API.TIME_ZONE_HEADER]: timeZone(),
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-1',
      },
      body: '{"taskId":"t1"}',
      credentials: 'same-origin',
    });

    await server.request('GET', '/tokens');
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/tokens', {
      method: 'GET',
      headers: { Accept: 'application/json', [SERVER_API.TIME_ZONE_HEADER]: timeZone() },
      body: undefined,
      credentials: 'same-origin',
    });
  });

  it('send no CSRF token before signing in, and read an empty reply as nothing', async () => {
    const fetch = respond(204);
    vi.stubGlobal('fetch', fetch);
    expect(await createServer().request('POST', '/auth/logout')).toBeUndefined();
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('X-CSRF-Token');
  });

  it("fail with the server's message and code", async () => {
    vi.stubGlobal('fetch', respond(409, '{"error":"that username is taken","code":"username_taken"}'));
    const failure = (await createServer()
      .request('POST', '/invites/x/accept', {})
      .catch((e: unknown) => e)) as ServerError;
    expect(failure).toBeInstanceOf(ServerError);
    expect(failure).toMatchObject({ status: 409, code: 'username_taken', message: 'that username is taken' });
  });

  it('fail plainly for a reply that is not the API (a proxy error page)', async () => {
    vi.stubGlobal('fetch', respond(502, '<html>Bad gateway</html>'));
    const failure = (await createServer()
      .request('GET', '/auth/me')
      .catch((e: unknown) => e)) as ServerError;
    expect(failure).toMatchObject({ status: 502, code: 'unexpected', message: 'The server answered 502.' });
  });

  it("say so when there's no answer at all", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    );
    const failure = (await createServer()
      .request('GET', '/auth/me')
      .catch((e: unknown) => e)) as ServerError;
    expect(failure).toMatchObject({ status: 0, code: 'unreachable' });
    expect(failure.message).toMatch(/Can't reach the TaskMint server/);
  });

  it('report a session that has ended', async () => {
    vi.stubGlobal('fetch', respond(401, '{"error":"sign in first","code":"unauthenticated"}'));
    const onUnauthorized = vi.fn();
    await expect(createServer({ onUnauthorized }).request('GET', '/tokens')).rejects.toThrow('sign in first');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    // Without a handler, it's just an error
    await expect(createServer().request('GET', '/tokens')).rejects.toThrow('sign in first');
  });
});

describe('what the user is told', () => {
  it('is a sentence', () => {
    expect(sentence('that username is taken')).toBe('That username is taken.');
    expect(sentence('Done!')).toBe('Done!');
  });

  it('names the common problems in plain words', () => {
    expect(problem(new ServerError(429, 'rate_limited', 'too many attempts; try again later'))).toBe(
      'Too many attempts. Wait a few minutes and try again.'
    );
    expect(problem(new ServerError(401, 'bad_credentials', 'wrong username or password'))).toBe(
      'Wrong username or password.'
    );
    expect(problem(new ServerError(400, 'invalid_request', 'a password is 8-256 characters'))).toBe(
      'A password is 8-256 characters.'
    );
  });
});
