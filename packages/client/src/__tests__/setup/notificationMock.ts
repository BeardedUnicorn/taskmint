/**
 * A stand-in for useNotification() in tests that mock NotificationContext:
 * every member is a vi.fn(), so a test can assert on what it sends.
 */
import { vi } from 'vitest';
import type { NotificationApi } from '../../contexts/NotificationContext';

export function createNotificationMock(): { [K in keyof NotificationApi]: ReturnType<typeof vi.fn> } {
  return {
    notify: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
  };
}
