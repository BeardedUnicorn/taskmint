/**
 * Tests for useSystemTray hook
 */

import { renderHook, act } from '@testing-library/react';
import { useSystemTray } from '../useSystemTray';
import { TimeEntry } from '../../types';

// Mock Tauri API
const mockInvoke = jest.fn();
const mockListen = jest.fn();

jest.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

jest.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

// Mock useNotification
const mockShowError = jest.fn();
jest.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
  }),
}));

// Mock window.__TAURI__ for Tauri environment detection
Object.defineProperty(window, '__TAURI__', {
  value: true,
  writable: true,
});

describe('useSystemTray', () => {
  const mockOnStartTimer = jest.fn();
  const mockOnStopTimer = jest.fn();
  const mockOnShowNewTaskDialog = jest.fn();

  const sampleActiveEntry: TimeEntry = {
    id: 'entry-1',
    taskId: 'task-1',
    taskName: 'Development',
    startTime: new Date('2024-01-01T10:00:00.000Z'),
    endTime: null,
    duration: 0,
    description: 'Working on feature',
    tags: [],
    hourlyRate: 50,
    earnings: 0,
  };

  const sampleTimeEntries: TimeEntry[] = [
    {
      id: 'entry-2',
      taskId: 'task-1',
      taskName: 'Development',
      startTime: new Date('2024-01-01T08:00:00.000Z'),
      endTime: new Date('2024-01-01T09:00:00.000Z'),
      duration: 3600000, // 1 hour
      description: 'Completed feature X',
      tags: [],
      hourlyRate: 50,
      earnings: 50,
    },
    {
      id: 'entry-3',
      taskId: 'task-2',
      taskName: 'Design',
      startTime: new Date('2024-01-01T09:30:00.000Z'),
      endTime: new Date('2024-01-01T10:30:00.000Z'),
      duration: 3600000, // 1 hour
      description: 'UI mockups',
      tags: [],
      hourlyRate: 75,
      earnings: 75,
    },
  ];

  const defaultProps = {
    activeEntry: null,
    timeEntries: sampleTimeEntries,
    onStartTimer: mockOnStartTimer,
    onStopTimer: mockOnStopTimer,
    onShowNewTaskDialog: mockOnShowNewTaskDialog,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockListen.mockResolvedValue(() => {});

    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T10:30:00.000Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should setup event listeners on mount', async () => {
      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockListen).toHaveBeenCalledWith('timer-started-from-tray', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('timer-stopped-from-tray', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('show-new-task-dialog', expect.any(Function));
    });

    it('should not setup listeners in browser environment', async () => {
      // Temporarily disable Tauri environment
      Object.defineProperty(window, '__TAURI__', {
        value: undefined,
        writable: true,
      });

      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockListen).not.toHaveBeenCalled();

      // Restore Tauri environment
      Object.defineProperty(window, '__TAURI__', {
        value: true,
        writable: true,
      });
    });

    it('should handle listener setup errors gracefully', async () => {
      const error = new Error('Failed to setup listeners');
      mockListen.mockRejectedValue(error);

      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockShowError).toHaveBeenCalledWith('Failed to setup system tray event listeners');
    });
  });

  describe('tray menu updates', () => {
    it('should update tray menu when active entry changes', async () => {
      const { rerender } = renderHook(
        (props) => useSystemTray(props),
        { initialProps: defaultProps }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Change to active entry
      rerender({
        ...defaultProps,
        activeEntry: sampleActiveEntry,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_tray_menu', expect.objectContaining({
        hasActiveTimer: true,
        currentTask: 'Development',
        elapsedTime: expect.any(String),
      }));
    });

    it('should update tray menu when time entries change', async () => {
      const { rerender } = renderHook(
        (props) => useSystemTray(props),
        { initialProps: defaultProps }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Add new time entry
      const newTimeEntries = [...sampleTimeEntries, {
        id: 'entry-4',
        taskId: 'task-3',
        taskName: 'Testing',
        startTime: new Date('2024-01-01T11:00:00.000Z'),
        endTime: new Date('2024-01-01T12:00:00.000Z'),
        duration: 3600000,
        description: 'Unit tests',
        tags: [],
        hourlyRate: 60,
        earnings: 60,
      }];

      rerender({
        ...defaultProps,
        timeEntries: newTimeEntries,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_tray_menu', expect.objectContaining({
        dailyTotal: expect.any(String),
        dailyEarnings: expect.any(Number),
      }));
    });

    it('should throttle tray updates to prevent excessive calls', async () => {
      const { rerender } = renderHook(
        (props) => useSystemTray(props),
        { initialProps: defaultProps }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Multiple rapid changes
      rerender({ ...defaultProps, activeEntry: sampleActiveEntry });
      rerender({ ...defaultProps, activeEntry: null });
      rerender({ ...defaultProps, activeEntry: sampleActiveEntry });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Should be throttled to prevent excessive updates
      expect(mockInvoke).toHaveBeenCalledTimes(1); // Initial call only
    });
  });

  describe('event handling', () => {
    it('should handle timer-started-from-tray event', async () => {
      let timerStartedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-started-from-tray') {
          timerStartedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Simulate timer started event
      const eventPayload = {
        payload: {
          taskName: 'Development',
          startTime: '2024-01-01T10:00:00.000Z',
        },
      };

      await act(async () => {
        timerStartedHandler!(eventPayload);
      });

      expect(mockOnStartTimer).toHaveBeenCalledWith(
        'Development',
        new Date('2024-01-01T10:00:00.000Z')
      );
    });

    it('should handle timer-stopped-from-tray event', async () => {
      let timerStoppedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-stopped-from-tray') {
          timerStoppedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Simulate timer stopped event
      const eventPayload = {
        payload: {
          taskName: 'Development',
          startTime: '2024-01-01T10:00:00.000Z',
          elapsedMs: 1800000, // 30 minutes
        },
      };

      await act(async () => {
        timerStoppedHandler!(eventPayload);
      });

      expect(mockOnStopTimer).toHaveBeenCalled();
    });

    it('should handle show-new-task-dialog event', async () => {
      let newTaskDialogHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'show-new-task-dialog') {
          newTaskDialogHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Simulate new task dialog event
      const eventPayload = {};

      await act(async () => {
        newTaskDialogHandler!(eventPayload);
      });

      expect(mockOnShowNewTaskDialog).toHaveBeenCalled();
    });
  });

  describe('tray title updates', () => {
    it('should update tray title when timer is active', async () => {
      const { rerender } = renderHook(
        (props) => useSystemTray(props),
        { initialProps: defaultProps }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Start timer
      rerender({
        ...defaultProps,
        activeEntry: sampleActiveEntry,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockInvoke).toHaveBeenCalledWith('set_tray_title', expect.any(String));
    });

    it('should clear tray title when timer is stopped', async () => {
      const { rerender } = renderHook(
        (props) => useSystemTray(props),
        {
          initialProps: {
            ...defaultProps,
            activeEntry: sampleActiveEntry,
          }
        }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Stop timer
      rerender({
        ...defaultProps,
        activeEntry: null,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockInvoke).toHaveBeenCalledWith('set_tray_title', '');
    });
  });

  describe('daily totals calculation', () => {
    it('should calculate correct daily totals', async () => {
      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_tray_menu', expect.objectContaining({
        dailyTotal: '2h 0m', // 2 hours total from sample entries
        dailyEarnings: 125, // $50 + $75
      }));
    });

    it('should handle empty time entries', async () => {
      renderHook(() => useSystemTray({
        ...defaultProps,
        timeEntries: [],
      }));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_tray_menu', expect.objectContaining({
        dailyTotal: '0h 0m',
        dailyEarnings: 0,
      }));
    });
  });

  describe('error handling', () => {
    it('should handle tray update errors gracefully', async () => {
      const error = new Error('Tray update failed');
      mockInvoke.mockRejectedValue(error);

      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockShowError).toHaveBeenCalledWith('Failed to update system tray');
    });

    it('should handle tray title update errors gracefully', async () => {
      const error = new Error('Title update failed');
      mockInvoke.mockImplementation((command) => {
        if (command === 'set_tray_title') {
          return Promise.reject(error);
        }
        return Promise.resolve();
      });

      renderHook(() => useSystemTray({
        ...defaultProps,
        activeEntry: sampleActiveEntry,
      }));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockShowError).toHaveBeenCalledWith('Failed to update system tray title');
    });
  });

  describe('cleanup', () => {
    it('should cleanup event listeners on unmount', async () => {
      const mockUnlisten = jest.fn();
      mockListen.mockResolvedValue(mockUnlisten);

      const { unmount } = renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      unmount();

      expect(mockUnlisten).toHaveBeenCalledTimes(3); // Three event listeners
    });
  });

  describe('browser environment', () => {
    it('should skip all Tauri operations in browser environment', async () => {
      // Disable Tauri environment
      Object.defineProperty(window, '__TAURI__', {
        value: undefined,
        writable: true,
      });

      renderHook(() => useSystemTray(defaultProps));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(mockListen).not.toHaveBeenCalled();

      // Restore Tauri environment
      Object.defineProperty(window, '__TAURI__', {
        value: true,
        writable: true,
      });
    });
  });

  describe('performance optimization', () => {
    it('should prevent unnecessary updates with same data', async () => {
      const { rerender } = renderHook(
        (props) => useSystemTray(props),
        { initialProps: defaultProps }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const initialCallCount = mockInvoke.mock.calls.length;

      // Rerender with same props
      rerender(defaultProps);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should not trigger additional updates
      expect(mockInvoke.mock.calls.length).toBe(initialCallCount);
    });
  });
});
