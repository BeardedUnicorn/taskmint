import { describe, expect, it } from 'vitest';
import { fnv1a64 } from '../fnv';

describe('fnv1a64', () => {
  it('is core’s sync hash (crates/taskmint-core/src/sync)', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('hashes the UTF-8 bytes, as core does', () => {
    expect(fnv1a64('Café ✓')).toBe('5a2869401061fc52');
  });
});
