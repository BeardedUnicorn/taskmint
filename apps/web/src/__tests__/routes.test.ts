import { describe, expect, it } from 'vitest';
import { loginPath, matchRoute, safeNext } from '../routes';

describe('routes', () => {
  it('are the web pages, and the app everywhere else', () => {
    expect(matchRoute('/login', '?next=%2Fhistory')).toEqual({ kind: 'login', next: '/history' });
    expect(matchRoute('/login', '')).toEqual({ kind: 'login', next: '/' });
    expect(matchRoute('/invite/abc%2Bdef', '')).toEqual({ kind: 'invite', token: 'abc+def' });
    expect(matchRoute('/reset/tok', '')).toEqual({ kind: 'reset', token: 'tok' });
    expect(matchRoute('/reset/tok/extra', '')).toEqual({ kind: 'app' });
    expect(matchRoute('/', '')).toEqual({ kind: 'app' });
  });

  it('only come back to a page on this site after signing in', () => {
    expect(safeNext('/settings?x=1')).toBe('/settings?x=1');
    for (const unsafe of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example']) {
      expect(safeNext(unsafe)).toBe('/');
    }
  });

  it('sign in and come back where the user was', () => {
    expect(loginPath({ pathname: '/', search: '' })).toBe('/login');
    expect(loginPath({ pathname: '/history', search: '?day=1' })).toBe('/login?next=%2Fhistory%3Fday%3D1');
  });
});
