/**
 * Mock for @tauri-apps/api/core
 */

export const invoke = vi.fn().mockImplementation((command: string, _args?: any) => {
  switch (command) {
    case 'start_timer':
      return Promise.resolve();
    case 'stop_timer':
      return Promise.resolve();
    case 'get_timer_state':
      return Promise.resolve({
        is_running: false,
        task_name: '',
        elapsed_ms: 0,
      });
    case 'update_timer_state':
      return Promise.resolve();
    case 'update_tray_tooltip':
      return Promise.resolve();
    case 'update_tray_menu_command':
      return Promise.resolve();
    case 'update_tasks':
      return Promise.resolve();
    case 'get_daily_total':
      return Promise.resolve({
        total_duration_ms: 0,
        task_count: 0,
      });
    default:
      return Promise.resolve();
  }
});
