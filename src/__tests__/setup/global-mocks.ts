/**
 * Global Mocks
 *
 * This file contains global mocks for dependencies that are used across multiple
 * test files. This helps to ensure consistency and reduce boilerplate.
 */
import { vi } from 'vitest';

// Mock Tauri API
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
  once: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  requestPermission: vi.fn(() => Promise.resolve('granted')),
  send: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => {
  const storeData: Record<string, any> = {};
  return {
    Store: vi.fn().mockImplementation(() => ({
      get: (key: string) => Promise.resolve(storeData[key] || null),
      set: (key: string, value: any) => {
        storeData[key] = value;
        return Promise.resolve();
      },
      save: () => Promise.resolve(),
    })),
  };
});

// Mock dayjs
vi.mock('dayjs', async () => {
  const dayjs = await vi.importActual<typeof import('dayjs')>('dayjs');
  const utc = await vi.importActual<typeof import('dayjs/plugin/utc')>('dayjs/plugin/utc');
  const timezone = await vi.importActual<typeof import('dayjs/plugin/timezone')>('dayjs/plugin/timezone');
  const customParseFormat = await vi.importActual<typeof import('dayjs/plugin/customParseFormat')>('dayjs/plugin/customParseFormat');
  
  dayjs.default.extend(utc.default);
  dayjs.default.extend(timezone.default);
  dayjs.default.extend(customParseFormat.default);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockDayjs = (...args: any[]) => dayjs.default(...args);
  
  Object.assign(mockDayjs, dayjs.default);

  return {
    ...dayjs,
    default: mockDayjs,
    __esModule: true,
  };
});

vi.mock('./global-mocks', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isToday: vi.fn(() => true),
  };
});

vi.mock('../../utils/dateHelpers', async () => {
  const actual = await vi.importActual<typeof import('../../utils/dateHelpers')>('../../utils/dateHelpers');
  return {
    ...actual,
    isToday: vi.fn((date: Date | string) => {
      const today = new Date();
      const d = new Date(date);
      return d.getFullYear() === today.getFullYear() &&
             d.getMonth() === today.getMonth() &&
             d.getDate() === today.getDate();
    }),
  };
});


