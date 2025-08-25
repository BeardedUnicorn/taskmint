/**
 * Integration Test for Timer Synchronization
 * 
 * Tests the synchronization between session timers and global timer state
 */

import '../../setupTests';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimerSync } from '../../hooks/useTimerSync';
import { TaskSession, TimerInstance } from '../../types/timer';

// Mock Tauri API
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

// Get the mocked functions
import { listen, emit } from '@tauri-apps/api/event';
const mockListen = vi.mocked(listen);
const mockEmit = vi.mocked(emit);

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock session management hook
vi.mock('../../hooks/useSessionManagement', () => ({
  useSessionManagement: vi.fn(),
}));

// Get the mocked function
import { useSessionManagement } from '../../hooks/useSessionManagement';
const mockUseSessionManagement = vi.mocked(useSessionManagement);
import { ActiveTimerProvider } from '../../contexts/ActiveTimerContext';

// Mock notification context
const mockShowWarning = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ showWarning: mockShowWarning }),
}));

describe('Timer Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock listen to return unsubscribe functions
    mockListen.mockResolvedValue(() => {});
    
    // Default mock for session management
    mockUseSessionManagement.mockReturnValue({
      activeSession: null,
      sessions: [],
      isLoading: false,
      error: null,
      createSession: vi.fn(),
      updateSession: vi.fn(),
      deleteSession: vi.fn(),
      getSessionById: vi.fn(),
      getSessionsByTaskId: vi.fn(),
      getActiveSession: vi.fn(),
      setActiveSession: vi.fn(),
      endActiveSession: vi.fn(),
      pauseAllTimersInActiveSession: vi.fn(),
      resumeAllTimersInActiveSession: vi.fn(),
      createTimerInstance: vi.fn(),
      startTimerInstance: vi.fn(),
      stopTimerInstance: vi.fn(),
      pauseTimerInstance: vi.fn(),
      resumeTimerInstance: vi.fn(),
      deleteTimerInstance: vi.fn(),
    });
  });

  it('should set up event listeners on mount', async () => {
    renderHook(() => useTimerSync(), { wrapper: ActiveTimerProvider });

    // Verify that the hook sets up event listeners
    expect(mockListen).toHaveBeenCalledWith('session-timer-started', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('session-timer-stopped', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('session-timer-paused', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('global-timer-started', expect.any(Function));
  });

  it('should return isGlobalTimerActive state', () => {
    const { result } = renderHook(() => useTimerSync(), { wrapper: ActiveTimerProvider });

    expect(result.current).toHaveProperty('isGlobalTimerActive');
    expect(typeof result.current.isGlobalTimerActive).toBe('boolean');
  });

  it('should activate global timer when session has running timer', () => {
    // Mock active session with running timer
    mockUseSessionManagement.mockReturnValue({
      activeSession: {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Test Task',
        timerInstances: [
          {
            id: 'timer-1',
            sessionId: 'session-1',
            startTime: new Date(),
            isRunning: true,
            isPaused: false,
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-15T10:00:00Z',
          },
        ],
        totalDuration: 0,
        isActive: true,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      },
      sessions: [],
      isLoading: false,
      error: null,
      createSession: vi.fn(),
      updateSession: vi.fn(),
      deleteSession: vi.fn(),
      getSessionById: vi.fn(),
      getSessionsByTaskId: vi.fn(),
      getActiveSession: vi.fn(),
      setActiveSession: vi.fn(),
      endActiveSession: vi.fn(),
      pauseAllTimersInActiveSession: vi.fn(),
      resumeAllTimersInActiveSession: vi.fn(),
      createTimerInstance: vi.fn(),
      startTimerInstance: vi.fn(),
      stopTimerInstance: vi.fn(),
      pauseTimerInstance: vi.fn(),
      resumeTimerInstance: vi.fn(),
      deleteTimerInstance: vi.fn(),
    });

    const { result } = renderHook(() => useTimerSync(), { wrapper: ActiveTimerProvider });

    expect(result.current.isGlobalTimerActive).toBe(true);
  });

  it('should deactivate global timer when no session timers are running', () => {
    // Mock active session with no running timers
    mockUseSessionManagement.mockReturnValue({
      activeSession: {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Test Task',
        timerInstances: [
          {
            id: 'timer-1',
            sessionId: 'session-1',
            startTime: new Date(),
            isRunning: false,
            isPaused: false,
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-15T10:00:00Z',
          },
        ],
        totalDuration: 0,
        isActive: true,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      },
      sessions: [],
      isLoading: false,
      error: null,
      createSession: vi.fn(),
      updateSession: vi.fn(),
      deleteSession: vi.fn(),
      getSessionById: vi.fn(),
      getSessionsByTaskId: vi.fn(),
      getActiveSession: vi.fn(),
      setActiveSession: vi.fn(),
      endActiveSession: vi.fn(),
      pauseAllTimersInActiveSession: vi.fn(),
      resumeAllTimersInActiveSession: vi.fn(),
      createTimerInstance: vi.fn(),
      startTimerInstance: vi.fn(),
      stopTimerInstance: vi.fn(),
      pauseTimerInstance: vi.fn(),
      resumeTimerInstance: vi.fn(),
      deleteTimerInstance: vi.fn(),
    });

    const { result } = renderHook(() => useTimerSync(), { wrapper: ActiveTimerProvider });

    expect(result.current.isGlobalTimerActive).toBe(false);
  });
});
