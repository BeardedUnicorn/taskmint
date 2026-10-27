/** What the server's account endpoints send back (apps/server/src/http). */

export type Role = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  timeZone: string;
}

/** `auth/me` and signing in. A bearer token's has no CSRF token. */
export interface SessionInfo {
  user: User;
  csrfToken: string | null;
}

export type TokenScope = 'capture' | 'full';

export interface TokenInfo {
  id: string;
  name: string;
  scope: TokenScope;
  /** `device`: made by a desktop app signing in. */
  kind: 'api' | 'device';
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** A token just made: `token` is its secret, shown this once. */
export interface NewToken extends Omit<TokenInfo, 'lastUsedAt'> {
  token: string;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  createdAt: string;
  disabledAt: string | null;
  lastSeenAt: string | null;
}

export interface Invite {
  id: string;
  role: Role;
  note: string;
  status: 'pending' | 'used' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string;
  createdBy: string | null;
  usedBy: string | null;
  usedAt: string | null;
}

/** An invite or password-reset link, shown to the admin to pass on. */
export interface NewLink {
  url: string;
  expiresAt: string;
}

/** What an invite link offers, before it's accepted. */
export interface InviteInfo {
  role: Role;
  expiresAt: string;
}

/** Whose password a reset link sets. */
export interface PasswordResetInfo {
  username: string;
  expiresAt: string;
}
