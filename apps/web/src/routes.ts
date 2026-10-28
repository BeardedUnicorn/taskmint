/**
 * The web app's own pages, by path: signing in, and the invite and
 * password-reset links an admin hands out (`/invite/<token>`,
 * `/reset/<token>`). Every other path is the app, which moves between its
 * pages without changing the URL.
 */

export type Route =
  | { kind: 'login'; next: string }
  | { kind: 'invite'; token: string }
  | { kind: 'reset'; token: string }
  | { kind: 'app' };

export function matchRoute(pathname: string, search: string): Route {
  if (pathname === '/login') {
    return { kind: 'login', next: safeNext(new URLSearchParams(search).get('next')) };
  }
  const link = /^\/(invite|reset)\/([^/]+)$/.exec(pathname);
  if (link) return { kind: link[1] as 'invite' | 'reset', token: decodeURIComponent(link[2]) };
  return { kind: 'app' };
}

/** A stand-in origin for resolving `next`; never visited. */
const THIS_SITE = 'https://taskmint.invalid';

/**
 * Where to go after signing in: a page on this site, never another one.
 * `next` is resolved the way the browser will resolve it (which drops tabs
 * and newlines, so "/\t/evil.example" is "//evil.example") and kept only if
 * it stays on this site.
 */
export function safeNext(next: string | null): string {
  try {
    const url = new URL(next ?? '/', THIS_SITE);
    if (url.origin === THIS_SITE) return url.pathname + url.search + url.hash;
  } catch {
    // Not a URL at all
  }
  return '/';
}

/** The sign-in page, coming back to `location` afterwards. */
export function loginPath(location: Pick<Location, 'pathname' | 'search'>): string {
  const here = location.pathname + location.search;
  return here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`;
}
