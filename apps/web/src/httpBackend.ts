/**
 * The client's Backend on the web. Commands go to the server's
 * `POST /api/v1/commands/{name}` with the desktop's names, arguments,
 * replies and error messages; events come from its event stream
 * (`GET /api/v1/events`), opened with the first subscription.
 *
 * When the stream drops, the browser reconnects, and the client is told to
 * `resync` (it may have missed events). When the server ends it for good
 * (the session was revoked), this checks the session before opening it
 * again; a session that's over sends the page to sign in.
 */

import { EVENTS, type CommandName, type CommandReply, type EventName } from '@taskmint/contracts';
import type { Backend, CommandArgsParam } from '@taskmint/client/backend';
import { API, type Server, type ServerError } from './server';
import { createWebPlatform } from './webPlatform';

/** How long to wait before opening a stream the server closed. */
export const REOPEN_MS = 5000;

/** EventSource.CLOSED: the browser won't reconnect by itself. */
const CLOSED = 2;

export type OpenStream = (url: string) => EventSource;

export interface HttpBackendOptions {
  server: Server;
  /** Opens the event stream (an EventSource). */
  openStream?: OpenStream;
}

type Handler = (payload: unknown) => void;

function eventStream(server: Server, openStream: OpenStream) {
  const handlers = new Map<string, Set<Handler>>();
  let source: EventSource | null = null;
  let reopening = false;
  let missedEvents = false;

  const deliver = (name: string, payload: unknown) => handlers.get(name)?.forEach(handler => handler(payload));

  const listen = (target: EventSource, name: string) =>
    target.addEventListener(name, event => deliver(name, JSON.parse((event as MessageEvent<string>).data)));

  function open() {
    const opened = openStream(`${API}/events`);
    source = opened;
    for (const name of handlers.keys()) listen(opened, name);
    opened.onopen = () => {
      if (!missedEvents) return;
      missedEvents = false;
      deliver(EVENTS.RESYNC, {});
    };
    opened.onerror = () => {
      missedEvents = true;
      if (opened.readyState !== CLOSED) return;
      source = null;
      reopenLater();
    };
  }

  function reopenLater() {
    reopening = true;
    setTimeout(async () => {
      try {
        await server.request('GET', '/auth/me');
      } catch (error) {
        // Signed out: the server's 401 has sent the page to sign in
        if ((error as ServerError).status !== 401) reopenLater();
        return;
      }
      reopening = false;
      open();
    }, REOPEN_MS);
  }

  return function subscribe<T = unknown>(event: EventName, handler: (payload: T) => void): () => void {
    let named = handlers.get(event);
    if (!named) {
      named = new Set();
      handlers.set(event, named);
      if (source) listen(source, event);
    }
    named.add(handler as Handler);
    if (!source && !reopening) open();
    const subscribed = named;
    return () => {
      subscribed.delete(handler as Handler);
    };
  };
}

export function createHttpBackend({
  server,
  openStream = url => new EventSource(url),
}: HttpBackendOptions): Backend {
  return {
    capabilities: { runtime: 'web', dataLocation: 'server' },
    async call<K extends CommandName>(name: K, ...args: CommandArgsParam<K>): Promise<CommandReply<K>> {
      try {
        return await server.request<CommandReply<K>>('POST', `/commands/${name}`, args[0]);
      } catch (error) {
        // As the desktop's backend does: the reason, as a plain string
        throw (error as ServerError).message;
      }
    },
    subscribe: eventStream(server, openStream),
    platform: createWebPlatform(),
  };
}
