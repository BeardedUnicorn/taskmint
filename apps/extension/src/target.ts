/**
 * Where captures go: the TaskMint app on this computer (the default), or a
 * TaskMint server with a token from its web app. The options page sets it,
 * in storage.local.
 */

export type Target = { kind: 'desktop' } | { kind: 'server'; url: string; token: string };

export const DESKTOP: Target = { kind: 'desktop' };
export const TARGET_KEY = 'target';
/** In storage.local while the server refuses the token: retries wait for new options. */
export const TOKEN_REJECTED = 'tokenRejected';

/** The saved target; the desktop app when there's none, or it isn't one. */
export async function loadTarget(): Promise<Target> {
  const { [TARGET_KEY]: saved } = await chrome.storage.local.get(TARGET_KEY);
  const { kind, url, token } = (saved ?? {}) as Record<string, unknown>;
  if (kind === 'server' && typeof url === 'string' && typeof token === 'string') {
    return { kind, url, token };
  }
  return DESKTOP;
}

export async function saveTarget(target: Target): Promise<void> {
  await chrome.storage.local.set({ [TARGET_KEY]: target });
}

/** The server's address as typed, checked: http or https, without a trailing slash. */
export function serverUrl(typed: string): string | null {
  try {
    const url = new URL(typed.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Whether the token would cross the network unencrypted: http to anywhere
 * but this computer (localhost, 127.x.x.x, ::1).
 */
export function sendsInTheClear(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  const local = hostname === 'localhost' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(hostname);
  return protocol === 'http:' && !local;
}

/** The host permission a server needs: the extension's fetches reach it past CORS. */
export function originPattern(url: string): string {
  return `${new URL(url).origin}/*`;
}
