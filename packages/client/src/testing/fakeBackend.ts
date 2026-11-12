/**
 * A Backend for tests: every command and platform call is a vitest mock, and
 * `emit` delivers an event to whatever subscribed. Defaults match a desktop
 * with nothing in it: commands resolve to undefined, dialogs are cancelled,
 * no OS notification shows (nor is any set for later), and every optional
 * platform feature is present (pass `without` to leave some out;
 * `laterNotifications` is notifications' schedule and cancel).
 */

import { vi, type Mock } from 'vitest';
import type {
  AnalyticsPlatform,
  Backend,
  Capabilities,
  FilePlatform,
  FolderBackupPlatform,
  IdlePlatform,
  NotificationPlatform,
  Platform,
  SplashScreenPlatform,
  SystemBarsPlatform,
  TrayPlatform,
} from '../backend/types';
import type { AppFolder, AppInfo, AppLink, CaptureServerStatus } from '@taskmint/contracts';

type Mocked<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : never;
};

export interface FakePlatform extends Platform {
  files: Mocked<FilePlatform>;
  notifications: Mocked<NotificationPlatform>;
  idle: Mocked<IdlePlatform>;
  folderBackups: Mocked<FolderBackupPlatform>;
  tray: Mocked<TrayPlatform>;
  systemBars: Mocked<SystemBarsPlatform>;
  splashScreen: Mocked<SplashScreenPlatform>;
  reveal: Mock<(path: string) => Promise<void>>;
  captureStatus: Mock<() => Promise<CaptureServerStatus>>;
  googleSignIn: Mock<(theme: 'light' | 'dark') => Promise<string>>;
  analytics: Mocked<AnalyticsPlatform>;
  appInfo: Mock<() => Promise<AppInfo>>;
  openLink: Mock<(link: AppLink) => Promise<void>>;
  openFolder: Mock<(folder: AppFolder) => Promise<void>>;
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
  without?: ReadonlyArray<
    | 'idle'
    | 'folderBackups'
    | 'tray'
    | 'systemBars'
    | 'splashScreen'
    | 'reveal'
    | 'captureStatus'
    | 'googleSignIn'
    | 'analytics'
    | 'appInfo'
    | 'openLink'
    | 'openFolder'
    | 'laterNotifications'
  >;
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
      schedule: vi.fn(async () => false),
      cancel: vi.fn(async () => undefined),
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
      list: vi.fn(async () => []),
      read: vi.fn(async () => '{}'),
    },
    tray: {
      setWithdrawalLabel: vi.fn(async () => undefined),
    },
    systemBars: {
      setTheme: vi.fn(),
    },
    splashScreen: {
      hide: vi.fn(),
    },
    reveal: vi.fn(async () => undefined),
    captureStatus: vi.fn(async () => ({ running: true, port: 43117, warning: null })),
    googleSignIn: vi.fn<(theme: 'light' | 'dark') => Promise<string>>(async () => 'google-id-token'),
    analytics: {
      setEnabled: vi.fn(),
      screen: vi.fn(),
    },
    appInfo: vi.fn(async () => ({
      version: '1.2.3',
      os: 'macos',
      arch: 'aarch64',
      dataDir: '/Users/me/Library/Application Support/com.taskmint.desktop',
      logDir: '/Users/me/Library/Logs/com.taskmint.desktop',
    })),
    openLink: vi.fn(async () => undefined),
    openFolder: vi.fn(async () => undefined),
  };
  for (const feature of without) {
    if (feature === 'laterNotifications') {
      delete (platform.notifications as Partial<FakePlatform['notifications']>).schedule;
      delete (platform.notifications as Partial<FakePlatform['notifications']>).cancel;
    } else {
      delete platform[feature];
    }
  }

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
