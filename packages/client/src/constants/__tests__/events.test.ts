import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKEND_EVENTS } from '../events';

/** `pub const NAME: &str = "value";` pairs from the `events` module of the core contract. */
function backendEvents(): Record<string, string> {
  const source = readFileSync(resolve(__dirname, '../../../../../crates/taskmint-core/src/contract.rs'), 'utf8');
  const [, events = ''] = source.split('pub mod events {');
  const body = events.split('\n}')[0];
  const pairs = [...body.matchAll(/pub const (\w+): &str = "([^"]+)";/g)];
  return Object.fromEntries(pairs.map(([, name, value]) => [name, value]));
}

describe('backend event names', () => {
  it('match the events in crates/taskmint-core/src/contract.rs exactly', () => {
    expect(BACKEND_EVENTS).toEqual(backendEvents());
  });
});
