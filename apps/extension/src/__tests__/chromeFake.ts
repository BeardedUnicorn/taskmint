/**
 * The parts of the chrome.* API the extension uses, in memory: every call is
 * a vi.fn, storage keeps what's set, alarms remember what's armed, and each
 * event can be emitted. `installChromeFake()` makes a fresh one the global
 * `chrome`, before the script under test is imported.
 */

import { vi } from 'vitest';

export class FakeEvent<A extends unknown[]> {
  readonly listeners: ((...args: A) => unknown)[] = [];

  addListener = (listener: (...args: A) => unknown) => {
    this.listeners.push(listener);
  };

  emit(...args: A): void {
    for (const listener of this.listeners) listener(...args);
  }
}

class FakeStorageArea {
  readonly data: Record<string, unknown> = {};

  get = vi.fn(async (keys: string | string[]): Promise<Record<string, unknown>> => {
    const found = [keys].flat().filter(key => key in this.data);
    return Object.fromEntries(found.map(key => [key, this.data[key]]));
  });

  set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(this.data, items);
  });

  remove = vi.fn(async (keys: string | string[]) => {
    for (const key of [keys].flat()) delete this.data[key];
  });
}

export function createChromeFake() {
  const armed = new Map<string, chrome.alarms.AlarmCreateInfo>();
  return {
    action: {
      setBadgeText: vi.fn(async (_details: chrome.action.BadgeTextDetails) => {}),
      setBadgeBackgroundColor: vi.fn(async (_details: chrome.action.BadgeColorDetails) => {}),
      setTitle: vi.fn(async (_details: chrome.action.TitleDetails) => {}),
      onClicked: new FakeEvent<[chrome.tabs.Tab]>(),
    },
    alarms: {
      armed,
      create: vi.fn(async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
        armed.set(name, info);
      }),
      clear: vi.fn(async (name: string) => armed.delete(name)),
      onAlarm: new FakeEvent<[chrome.alarms.Alarm]>(),
    },
    runtime: {
      sendMessage: vi.fn(async (_message: unknown): Promise<unknown> => undefined),
      onMessage: new FakeEvent<[unknown, chrome.runtime.MessageSender]>(),
      onStartup: new FakeEvent<[]>(),
      onInstalled: new FakeEvent<[]>(),
    },
    storage: {
      local: new FakeStorageArea(),
      session: new FakeStorageArea(),
      onChanged: new FakeEvent<[Record<string, chrome.storage.StorageChange>, string]>(),
    },
    permissions: {
      request: vi.fn(async (_permissions: chrome.permissions.Permissions) => true),
      remove: vi.fn(async (_permissions: chrome.permissions.Permissions) => true),
    },
    tabs: {
      sendMessage: vi.fn(async (_tabId: number, _message: unknown): Promise<unknown> => undefined),
      create: vi.fn(async (properties: chrome.tabs.CreateProperties) => ({ id: 70, ...properties }) as chrome.tabs.Tab),
      remove: vi.fn(async (_tabId: number) => {}),
      reload: vi.fn(async (_tabId: number) => {}),
    },
  };
}

export type ChromeFake = ReturnType<typeof createChromeFake>;

export function installChromeFake(): ChromeFake {
  const fake = createChromeFake();
  vi.stubGlobal('chrome', fake);
  return fake;
}

/** The badge as the user sees it: the last text, color and title set. */
export function badge(fake: ChromeFake) {
  const last = <T,>(mock: { mock: { calls: T[][] } }) => mock.mock.calls.at(-1)?.[0];
  return {
    text: last(fake.action.setBadgeText)?.text,
    color: last(fake.action.setBadgeBackgroundColor)?.color,
    title: last(fake.action.setTitle)?.title,
  };
}
