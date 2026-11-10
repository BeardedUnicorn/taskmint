import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackend } from '@taskmint/client/testing';

// The WebAssembly module, stood in for: a core that answers by command
const wasm = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  calls: [] as [string, string, number][],
  zones: [] as string[],
  /** Each core made, with the events it holds. */
  cores: [] as { events: string }[],
}));
vi.mock('../wasm/taskmint_core.js', () => ({
  default: wasm.init,
  Core: class {
    events = '[]';
    constructor(zone: string) {
      wasm.zones.push(zone);
      wasm.cores.push(this);
    }
    call(name: string, args: string, now: number) {
      wasm.calls.push([name, args, now]);
      if (name === 'start_task') throw 'Choose a task to start';
      return '{"records":{},"revisions":{}}';
    }
    takeEvents() {
      const events = this.events;
      this.events = '[]';
      return events;
    }
  },
}));
vi.mock('../wasm/taskmint_core_bg.wasm?url', () => ({ default: '/assets/core.wasm' }));

const { browserZone, createWasmBackend } = await import('../wasmBackend');

beforeEach(() => {
  wasm.calls = [];
  wasm.zones = [];
});

describe("the web app's backend", () => {
  it("loads the core and runs commands in the browser's zone", async () => {
    const { platform } = createFakeBackend();
    const backend = await createWasmBackend(platform, 'Europe/Paris');
    expect(wasm.init).toHaveBeenCalledWith({ module_or_path: '/assets/core.wasm' });
    expect(wasm.zones).toEqual(['Europe/Paris']);
    expect(backend.capabilities).toEqual({ runtime: 'web', dataLocation: 'cloud' });
    expect(backend.platform).toBe(platform);

    expect(await backend.call('get_app_records')).toEqual({ records: {}, revisions: {} });
    await backend.call('get_sessions');
    expect(wasm.calls.map(([name, args]) => [name, args])).toEqual([
      ['get_app_records', '{}'],
      ['get_sessions', '{}'],
    ]);
    await expect(backend.call('start_task', { taskId: '', taskName: '' })).rejects.toBe('Choose a task to start');
    expect(wasm.calls[2][1]).toBe('{"taskId":"","taskName":""}');

    expect(typeof browserZone()).toBe('string');
    await createWasmBackend(platform);
    expect(wasm.zones[1]).toBe(browserZone());
  });

  it('hands each event to its subscribers after the reply, until they unsubscribe', async () => {
    const backend = await createWasmBackend(createFakeBackend().platform, 'UTC');
    const seen = vi.fn();
    const other = vi.fn();
    const unsubscribe = backend.subscribe('sessions-changed', seen);
    backend.subscribe('sessions-changed', other);
    const core = wasm.cores.at(-1)!;
    core.events = '[{"name":"sessions-changed","payload":null},{"name":"resync","payload":1}]';
    await backend.call('get_sessions');
    expect(seen).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith(null));

    unsubscribe();
    core.events = '[{"name":"sessions-changed","payload":2}]';
    await backend.call('get_sessions');
    await vi.waitFor(() => expect(other).toHaveBeenCalledWith(2));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
