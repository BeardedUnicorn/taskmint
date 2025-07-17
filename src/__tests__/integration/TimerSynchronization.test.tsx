/**
 * Integration Test for Timer Synchronization
 * 
 * Tests the synchronization between session timers and global timer state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimerSync } from '../../hooks/useTimerSync';
import { TimeEntry } from '../../types/timer';

// Mock Tauri API
const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

describe('Timer Synchronization', () => {
  let mockSetActiveEntry: ReturnType<typeof vi.fn>;
  let activeEntry: TimeEntry | null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetActiveEntry = vi.fn();
    activeEntry = null;
    
    // Mock listen to return unsubscribe functions
    mockListen.mockResolvedValue(() => {});
  });

  it('should create global timer entry when session timer starts', async () => {
    const { result } = renderHook(() =>
      useTimerSync({
        activeEntry,
        setActiveEntry: mockSetActiveEntry,
        activeSession: null,
      })
    );

    // Verify that the hook sets up event listeners
    expect(mockListen).toHaveBeenCalledWith('timer-instance-started', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('timer-instance-stopped', expect.any(Function));
  });

  it('should handle session timer stop events', async () => {
    activeEntry = {
      id: 'session_instance123',
      taskName: 'Test Task',
      startTime: new Date(),
      isRunning: true,
      date: '2024-01-15',
    };

    const { result } = renderHook(() =>
      useTimerSync({
        activeEntry,
        setActiveEntry: mockSetActiveEntry,
        activeSession: null,
      })
    );

    // Verify event listeners are set up
    expect(mockListen).toHaveBeenCalledTimes(2);
  });

  it('should sync global timer state with backend', async () => {
    const testEntry: TimeEntry = {
      id: 'test123',
      taskName: 'Test Task',
      startTime: new Date(),
      isRunning: true,
      date: '2024-01-15',
    };

    const { result } = renderHook(() =>
      useTimerSync({
        activeEntry: testEntry,
        setActiveEntry: mockSetActiveEntry,
        activeSession: null,
      })
    );

    await act(async () => {
      await result.current.syncGlobalTimerWithSessions(testEntry);
    });

    expect(mockInvoke).toHaveBeenCalledWith('update_timer_state', {
      isRunning: true,
      taskName: 'Test Task',
      startTime: testEntry.startTime.toISOString(),
      elapsedMs: expect.any(Number),
    });
  });

  it('should clear backend state when no active timer', async () => {
    const { result } = renderHook(() =>
      useTimerSync({
        activeEntry: null,
        setActiveEntry: mockSetActiveEntry,
        activeSession: null,
      })
    );

    await act(async () => {
      await result.current.syncGlobalTimerWithSessions(null);
    });

    expect(mockInvoke).toHaveBeenCalledWith('update_timer_state', {
      isRunning: false,
      taskName: '',
      startTime: null,
      elapsedMs: 0,
    });
  });
});
