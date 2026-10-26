/**
 * A Backend for tests: every command and platform call is a vitest mock, and
 * `emit` delivers an event to whatever subscribed. Defaults match a desktop
 * with nothing in it: commands resolve to undefined, dialogs are cancelled,
 * no OS notification shows, and every optional platform feature is present
 * (pass `without` to leave some out).
 */

import { vi, type Mock } from 'vitest';
import type {
  Backend,
  Capabilities,
  FilePlatform,
  FolderBackupPlatform,
  IdlePlatform,
  NotificationPlatform,
  Platform,
} from '../backend/types';
import type { CaptureServerStatus } from '@taskmint/contracts';

type Mocked<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : never;
};

export interface FakePlatform extends Platform {
  files: Mocked<FilePlatform>;
  notifications: Mocked<NotificationPlatform>;
  idle: Mocked<IdlePlatform>;
  folderBackups: Mocked<FolderBackupPlatform>;
  reveal: Mock<(path: string) => Promise<void>>;
  captureStatus: Mock<() => Promise<CaptureServerStatus>>;
}

/**
 * A Backend whose `call` and `subscribe` are loosely typed mocks, so a test
 * can make any command return anything (installFakeBackend hands it over as
 * a Backend).
 */
export interface FakeBackend extends Omit<Backend, 'call' | 'subscribe'> {
  capabilities: Capabilities;
  // Tests decide what each command returns
  call: Mock<(command: string, args?: Record<string, unknown>) => Promise<any>>;
  subscribe: Mock<(event: string, handler: (payload: any) => void) => () => void>;
  platform: FakePlatform;
  /** Delivers `payload` to every current subscriber of `event`. */
  emit(event: string, payload?: unknown): void;
  /** How many handlers listen to `event` now. */
  listenerCount(event: string): number;
}

export interface FakeBackendOptions {
  capabilities?: Partial<Capabilities>;
  /** Optional platform features this backend lacks (as on the web). */
  without?: ReadonlyArray<'idle' | 'folderBackups' | 'reveal' | 'captureStatus'>;
}

export function createFakeBackend({ capabilities, without = [] }: FakeBackendOptions = {}): FakeBackend {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const platform: FakePlatform = {
    files: {
      save: vi.fn(async () => null),
      openJson: vi.fn(async () => null),
    },
    notifications: {
      show: vi.fn(async () => false),
      setPreferences: vi.fn(async () => undefined),
    },
    idle: {
      isSupported: vi.fn(async () => true),
      setSettings: vi.fn(async () => undefined),
      getPending: vi.fn(async () => null),
      resolve: vi.fn(async () => undefined),
    },
    folderBackups: {
      defaultFolder: vi.fn(async () => null),
      pickFolder: vi.fn(async () => null),
      validateFolder: vi.fn(async () => ({ isValid: true })),
      write: vi.fn(async () => ({ success: true, timestamp: new Date().toISOString() })),
    },
    reveal: vi.fn(async () => undefined),
    captureStatus: vi.fn(async () => ({ running: true, port: 43117, warning: null })),
  };
  for (const feature of without) delete platform[feature];

  return {
    capabilities: { runtime: 'desktop', dataLocation: 'local', ...capabilities },
    call: vi.fn(async () => undefined),
    subscribe: vi.fn((event: string, handler: (payload: unknown) => void) => {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
      return () => {
        handlers.delete(handler);
      };
    }),
    platform,
    emit(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload);
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}
