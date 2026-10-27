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

/** Where to go after signing in: a path on this site, never another one. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

/** The sign-in page, coming back to `location` afterwards. */
export function loginPath(location: Pick<Location, 'pathname' | 'search'>): string {
  const here = location.pathname + location.search;
  return here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`;
}
