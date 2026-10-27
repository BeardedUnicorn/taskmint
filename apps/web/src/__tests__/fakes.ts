import { vi, type Mock } from 'vitest';
import { ServerError, type Method, type Server } from '../server';

type Handler = (body: unknown) => unknown;

export type FakeServer = Server & { request: Mock<(method: Method, path: string, body?: unknown) => Promise<unknown>> };

/**
 * A server answering `"<METHOD> <path>"` routes; a handler that throws
 * fails the request, and any other request is a 404.
 */
export function fakeServer(routes: Record<string, Handler> = {}): FakeServer {
  const request = vi.fn(async (method: Method, path: string, body?: unknown) => {
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new ServerError(404, 'not_found', `no route for ${method} ${path}`);
    return handler(body);
  });
  return { request } as FakeServer;
}

export function failure(status: number, code: string, message: string): never {
  throw new ServerError(status, code, message);
}

/** An EventSource the test drives: open it, send it events, drop it. */
export class FakeEventSource extends EventTarget {
  static opened: FakeEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    super();
    FakeEventSource.opened.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  send(name: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  }

  /** The connection dropped; `closed` when the browser gives up on it. */
  fail(closed = false) {
    this.readyState = closed ? 2 : 0;
    this.onerror?.();
  }
}

export function openFakeStream(url: string): EventSource {
  return new FakeEventSource(url) as unknown as EventSource;
}

export function lastStream(): FakeEventSource {
  return FakeEventSource.opened[FakeEventSource.opened.length - 1];
}
