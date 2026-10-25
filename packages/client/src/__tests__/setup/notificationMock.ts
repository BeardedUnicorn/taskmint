/**
 * A stand-in for useNotification() in tests that mock NotificationContext:
 * every member is a vi.fn(), so a test can assert on what it sends.
 */
import { vi } from 'vitest';
import type { NotificationApi } from '../../contexts/NotificationContext';

export function createNotificationMock(): { [K in keyof NotificationApi]: ReturnType<typeof vi.fn> } {
  return {
    notify: vi.fn(() => 'toast-1'),
    update: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
    showNotification: vi.fn(() => 'toast-1'),
    showSuccess: vi.fn(() => 'toast-1'),
    showError: vi.fn(() => 'toast-1'),
    showWarning: vi.fn(() => 'toast-1'),
    showInfo: vi.fn(() => 'toast-1'),
    hideNotification: vi.fn(),
    hideAllNotifications: vi.fn(),
  };
}
