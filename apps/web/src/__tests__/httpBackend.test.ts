import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from '@taskmint/contracts';
import { createHttpBackend, REOPEN_MS } from '../httpBackend';
import { failure, FakeEventSource, fakeServer, lastStream, openFakeStream } from './fakes';

beforeEach(() => {
  FakeEventSource.opened = [];
});

describe('commands', () => {
  it("go to the server by name, and fail with the server's message", async () => {
    const server = fakeServer({
      'POST /commands/get_sessions': () => [],
      'POST /commands/delete_session': () => failure(400, 'rejected', 'Session with ID s1 not found'),
    });
    const backend = createHttpBackend({ server, openStream: openFakeStream });

    expect(backend.capabilities).toEqual({ runtime: 'web', dataLocation: 'server' });
    await expect(backend.call('get_sessions')).resolves.toEqual([]);
    expect(server.request).toHaveBeenCalledWith('POST', '/commands/get_sessions', undefined);
    await expect(backend.call('delete_session', { sessionId: 's1' })).rejects.toBe('Session with ID s1 not found');
    expect(server.request).toHaveBeenLastCalledWith('POST', '/commands/delete_session', { sessionId: 's1' });
    expect(Object.keys(backend.platform)).toEqual(['files', 'notifications']);
    // Commands alone open no stream
    expect(FakeEventSource.opened).toEqual([]);
  });
});

describe('events', () => {
  it('come from one stream, opened with the first subscription', () => {
    const backend = createHttpBackend({ server: fakeServer(), openStream: openFakeStream });
    const started = vi.fn();
    const stopped = vi.fn();
    const stopListening = backend.subscribe(EVENTS.TIMER_INSTANCE_STARTED, started);
    backend.subscribe(EVENTS.TIMER_INSTANCE_STOPPED, stopped);
    backend.subscribe(EVENTS.TIMER_INSTANCE_STOPPED, stopped);

    expect(FakeEventSource.opened.map(stream => stream.url)).toEqual(['/api/v1/events']);
    const stream = lastStream();
    stream.open();
    stream.send(EVENTS.TIMER_INSTANCE_STARTED, { instanceId: 'i1' });
    stream.send(EVENTS.TIMER_INSTANCE_STOPPED, { instanceId: 'i1' });

    expect(started).toHaveBeenCalledWith({ instanceId: 'i1' });
    expect(stopped).toHaveBeenCalledTimes(1);

    stopListening();
    stream.send(EVENTS.TIMER_INSTANCE_STARTED, { instanceId: 'i2' });
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('say resync after the browser reconnects a dropped stream', () => {
    const backend = createHttpBackend({ server: fakeServer(), openStream: openFakeStream });
    const resync = vi.fn();
    backend.subscribe(EVENTS.RESYNC, resync);
    const stream = lastStream();
    stream.open();
    expect(resync).not.toHaveBeenCalled();

    stream.fail();
    stream.open();
    expect(resync).toHaveBeenCalledTimes(1);
    // And when the server says so itself
    stream.send(EVENTS.RESYNC, {});
    expect(resync).toHaveBeenCalledTimes(2);
  });

  describe('when the server ends the stream', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('open it again once the session checks out, with every subscription', async () => {
      let signedIn: boolean | 'unreachable' = 'unreachable';
      const server = fakeServer({
        'GET /auth/me': () => (signedIn === true ? {} : failure(0, 'unreachable', "Can't reach the TaskMint server.")),
      });
      const backend = createHttpBackend({ server, openStream: openFakeStream });
      const started = vi.fn();
      const resync = vi.fn();
      backend.subscribe(EVENTS.TIMER_INSTANCE_STARTED, started);
      lastStream().open();
      lastStream().fail(true);

      // Subscribing meanwhile waits for the reopened stream
      backend.subscribe(EVENTS.RESYNC, resync);
      expect(FakeEventSource.opened).toHaveLength(1);
      // Unreachable: it tries again later
      await vi.advanceTimersByTimeAsync(REOPEN_MS);
      expect(FakeEventSource.opened).toHaveLength(1);
      signedIn = true;
      await vi.advanceTimersByTimeAsync(REOPEN_MS);

      expect(FakeEventSource.opened).toHaveLength(2);
      const reopened = lastStream();
      reopened.open();
      expect(resync).toHaveBeenCalledTimes(1);
      reopened.send(EVENTS.TIMER_INSTANCE_STARTED, { instanceId: 'i3' });
      expect(started).toHaveBeenCalledWith({ instanceId: 'i3' });
      expect(server.request).toHaveBeenCalledTimes(2);
    });

    it("stop for a session that's over (the 401 sends the page to sign in)", async () => {
      const server = fakeServer({ 'GET /auth/me': () => failure(401, 'unauthenticated', 'sign in first') });
      const backend = createHttpBackend({ server, openStream: openFakeStream });
      backend.subscribe(EVENTS.SESSIONS_CHANGED, vi.fn());
      lastStream().fail(true);

      await vi.advanceTimersByTimeAsync(REOPEN_MS * 3);
      expect(server.request).toHaveBeenCalledTimes(1);
      expect(FakeEventSource.opened).toHaveLength(1);
    });
  });

  it('use the browser’s EventSource by default', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const backend = createHttpBackend({ server: fakeServer() });
    backend.subscribe(EVENTS.SESSIONS_CHANGED, vi.fn());
    expect(lastStream().url).toBe('/api/v1/events');
    vi.unstubAllGlobals();
  });
});
