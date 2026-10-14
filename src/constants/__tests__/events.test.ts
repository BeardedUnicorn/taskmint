import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKEND_EVENTS } from '../events';

/** `pub const NAME: &str = "value";` pairs from the backend's events.rs. */
function backendEvents(): Record<string, string> {
  const source = readFileSync(resolve(__dirname, '../../../src-tauri/src/events.rs'), 'utf8');
  const pairs = [...source.matchAll(/pub const (\w+): &str = "([^"]+)";/g)];
  return Object.fromEntries(pairs.map(([, name, value]) => [name, value]));
}

describe('backend event names', () => {
  it('match src-tauri/src/events.rs exactly', () => {
    expect(BACKEND_EVENTS).toEqual(backendEvents());
  });
});
