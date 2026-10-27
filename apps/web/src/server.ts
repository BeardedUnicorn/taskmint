/**
 * Requests to the TaskMint server's API (`/api/v1`, on this origin). Each
 * one names the browser's time zone, and a signed-in session's changes
 * carry its CSRF token. A failure is a ServerError: the server's message
 * and code, or `unreachable` when there was no answer.
 */

import { SERVER_API } from '@taskmint/contracts';

export const API = '/api/v1';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

export interface ServerOptions {
  /** The session's CSRF token, once signed in. */
  csrfToken?: string;
  /** Called when the server says the session is over (a 401). */
  onUnauthorized?: () => void;
}

export interface Server {
  /** The response's JSON, or undefined for an empty one. */
  request<T>(method: Method, path: string, body?: unknown): Promise<T>;
}

/** The browser's IANA time zone, which the server dates sessions in. */
export function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const UNREACHABLE = "Can't reach the TaskMint server. Check your connection and try again.";

/** JSON, or nothing for a body that isn't (a proxy's error page). */
function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createServer({ csrfToken, onUnauthorized }: ServerOptions = {}): Server {
  return {
    async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        [SERVER_API.TIME_ZONE_HEADER]: timeZone(),
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
      let response: Response;
      try {
        response = await fetch(`${API}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: 'same-origin',
        });
      } catch {
        throw new ServerError(0, 'unreachable', UNREACHABLE);
      }
      const data = parse(await response.text());
      if (response.ok) return data as T;
      if (response.status === 401) onUnauthorized?.();
      const { error, code } = (data ?? {}) as { error?: string; code?: string };
      throw new ServerError(response.status, code ?? 'unexpected', error ?? `The server answered ${response.status}.`);
    },
  };
}

/** A server message as a sentence: "that username is taken" → "That username is taken." */
export function sentence(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** What to tell the user about a failed request. */
export function problem(error: unknown): string {
  const { code, message } = error as ServerError;
  if (code === 'rate_limited') return 'Too many attempts. Wait a few minutes and try again.';
  if (code === 'bad_credentials') return 'Wrong username or password.';
  return sentence(message);
}
