import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { TaskSession, TimerInstance } from '../types/timer';

// use global mocked invoke from setup files

describe('Tauri session commands', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('creates and manages sessions and timer instances', async () => {
    const session: TaskSession = {
      id: 'session-1',
      taskId: 'test-task-1',
      taskName: 'Test Task for Session',
      timerInstances: [],
      totalDuration: 0,
      isActive: true,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const timerInstance: TimerInstance = {
      id: 'instance-1',
      sessionId: 'session-1',
      startTime: new Date(),
      endTime: null,
      duration: null,
      isRunning: true,
      isPaused: false,
      pausedAt: null,
      pausedDuration: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const newTimer: TimerInstance = {
      ...timerInstance,
      id: 'instance-2',
      isRunning: false,
    };

    const updatedSession: TaskSession = {
      ...session,
      timerInstances: [timerInstance, newTimer],
    };

    vi.mocked(invoke).mockImplementation((cmd, args) => {
      switch (cmd) {
        case 'clear_all_sessions':
          return Promise.resolve();
        case 'create_session_with_timer':
          return Promise.resolve([session, timerInstance]);
        case 'get_sessions':
          return Promise.resolve([session]);
        case 'create_timer_instance':
          expect(args).toEqual({ sessionId: session.id });
          return Promise.resolve(newTimer);
        case 'start_timer_instance':
          expect(args).toEqual({ instanceId: newTimer.id });
          return Promise.resolve(updatedSession);
        default:
          return Promise.resolve();
      }
    });

    await invoke('clear_all_sessions');

    const [createdSession, createdTimer] = await invoke('create_session_with_timer', {
      taskId: 'test-task-1',
      taskName: 'Test Task for Session',
    });
    expect(createdSession).toEqual(session);
    expect(createdTimer).toEqual(timerInstance);

    const sessions = await invoke('get_sessions');
    expect(sessions).toEqual([session]);

    const newTimerInstance = await invoke('create_timer_instance', { sessionId: session.id });
    expect(newTimerInstance).toEqual(newTimer);

    const startedSession = await invoke('start_timer_instance', { instanceId: newTimer.id });
    expect(startedSession).toEqual(updatedSession);
  });
});
