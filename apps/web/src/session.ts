import type { Server } from './server';
import type { User } from './types';

/** The signed-in user, and how the web app's own sections reach the server. */
export interface WebSession {
  user: User;
  server: Server;
  /** Leaves the app for one of the web app's own pages (signing in). */
  navigate: (path: string) => void;
}

/** A timestamp as the user reads dates. */
export function shortDate(iso: string | null, never = 'Never'): string {
  return iso === null ? never : new Date(iso).toLocaleDateString();
}
