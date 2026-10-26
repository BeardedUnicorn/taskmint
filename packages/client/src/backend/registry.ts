/**
 * The page's backend. startClient sets it once, before the first render, and
 * it stays for the page's life (switching where data lives restarts the
 * app), so hooks and services read it directly rather than through context.
 */

import type { Backend } from './types';

let current: Backend | null = null;

export function setBackend(backend: Backend): void {
  current = backend;
}

export function getBackend(): Backend {
  if (!current) throw new Error('No backend: startClient sets one before rendering');
  return current;
}
