/**
 * Mock for @tauri-apps/api/core
 */

export const invoke = vi.fn().mockImplementation((command: string, args?: any) => {
  switch (command) {
    case 'start_timer':
      return Promise.resolve();
    case 'stop_timer':
      return Promise.resolve();
    case 'update_tasks':
      return Promise.resolve();
    case 'get_sessions':
      return Promise.resolve([]);
    case 'create_session':
      return Promise.resolve({
        id: 'session-1',
        taskId: args?.taskId || 'task-1',
        taskName: args?.taskName || 'Test Task',
        timerInstances: [],
        totalDuration: 0,
        isActive: false,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    case 'create_session_with_timer':
      const session = {
        id: 'session-1',
        taskId: args?.taskId || 'task-1',
        taskName: args?.taskName || 'Test Task',
        timerInstances: [],
        totalDuration: 0,
        isActive: true,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const timerInstance = {
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
      return Promise.resolve([session, timerInstance]);
    case 'create_timer_instance':
      return Promise.resolve({
        id: 'instance-1',
        sessionId: args?.sessionId || 'session-1',
        startTime: new Date(),
        endTime: null,
        duration: null,
        isRunning: false,
        isPaused: false,
        pausedAt: null,
        pausedDuration: null,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    case 'start_timer_instance':
    case 'stop_timer_instance':
    case 'pause_timer_instance':
    case 'resume_timer_instance':
    case 'update_timer_instance':
    case 'update_session':
    case 'delete_session':
      return Promise.resolve();
    case 'get_enhanced_timer_state':
      return Promise.resolve({
        activeSession: null,
        activeInstance: null,
        isRunning: false,
        taskName: '',
        sessionId: null,
        instanceId: null,
        startTime: null,
        elapsedMs: 0,
        isPaused: false,
        pausedDueToInactivity: false,
      });
    default:
      return Promise.resolve();
  }
});
