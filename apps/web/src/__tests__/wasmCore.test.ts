// The real core (scripts/build-wasm.mjs's build): the bindings work, ids are
// random, errors come through as the rule's words, and days are the
// browser zone's.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Core, initSync } from '../wasm/taskmint_core.js';

// (Tests run from apps/web)
initSync({ module: readFileSync(resolve('src/wasm/taskmint_core_bg.wasm')) });

describe('the core in WebAssembly', () => {
  it('runs commands, dates them in its zone, and reports their events', () => {
    const core = new Core('America/New_York');
    // 2026-11-10T03:00:00Z: still the 9th in New York
    const now = Date.UTC(2026, 10, 10, 3);
    const started = JSON.parse(core.call('start_task', '{"taskId":"t1","taskName":"Writing"}', now));
    expect(started.outcome).toBe('started');
    expect(started.instanceId).toMatch(/^instance_[0-9a-f-]{36}$/);
    expect(JSON.parse(core.takeEvents())[0].name).toBe('timer-instance-started');
    expect(JSON.parse(core.call('get_sessions', '{}', now))[0].date).toBe('2026-11-09');
    expect(() => core.call('start_task', '{"taskId":"","taskName":""}', now)).toThrow();
    try {
      core.call('start_task', '{"taskId":"","taskName":""}', now);
    } catch (error) {
      expect(error).toBe('Choose a task to start');
    }
  });
});
