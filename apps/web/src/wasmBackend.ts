/**
 * The web app's backend: TaskMint's rules (crates/taskmint-core) running in
 * the page as WebAssembly, on data cloud sync keeps in step with the cloud.
 * Commands answer as the desktop's do (a rejection is the rule's own words),
 * and their events follow the reply.
 */

import type { CommandName, CommandReply } from '@taskmint/contracts';
import type { Backend, CommandArgsParam, Platform } from '@taskmint/client/backend';
import init, { Core } from './wasm/taskmint_core.js';
import wasmUrl from './wasm/taskmint_core_bg.wasm?url';

/** The browser's time zone, which sessions are dated in. */
export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export async function createWasmBackend(platform: Platform, zone = browserZone()): Promise<Backend> {
  await init({ module_or_path: wasmUrl });
  const core = new Core(zone);
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const deliver = () => {
    const events = JSON.parse(core.takeEvents()) as { name: string; payload: unknown }[];
    for (const { name, payload } of events) {
      for (const handler of [...(listeners.get(name) ?? [])]) handler(payload);
    }
  };

  return {
    capabilities: { runtime: 'web', dataLocation: 'cloud' },
    async call<K extends CommandName>(command: K, ...args: CommandArgsParam<K>): Promise<CommandReply<K>> {
      // Throws the rule's message, which rejects this call with it
      const reply = core.call(command, JSON.stringify(args[0] ?? {}), Date.now());
      setTimeout(deliver, 0);
      return JSON.parse(reply) as CommandReply<K>;
    },
    subscribe<T>(event: string, handler: (payload: T) => void) {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler as (payload: unknown) => void);
      listeners.set(event, handlers);
      return () => {
        handlers.delete(handler as (payload: unknown) => void);
      };
    },
    platform,
  };
}
