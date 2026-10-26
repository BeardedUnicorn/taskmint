/**
 * System tray bridge.
 *
 * The tray itself lives in the desktop app's Rust: it reads sessions directly
 * and starts/stops timers through the same session logic as the app (the
 * session context reloads on the timer-instance events those actions emit).
 * The client mirrors the task list to the backend (for the tray's Start
 * submenu, and so sessions follow task renames and rates) and opens the
 * start dialog when the tray's "Choose Task…" / "Add a Task…" asks for it.
 */

import { useEffect } from 'react';
import { Task } from '../types/task';
import { getBackend, useBackendEvent } from '../backend';
import { BACKEND_EVENTS } from '../constants/events';

export interface UseEnhancedSystemTrayProps {
  tasks: Task[];
  onShowStartDialog: () => void;
}

export function useEnhancedSystemTray({ tasks, onShowStartDialog }: UseEnhancedSystemTrayProps) {
  // Keep the backend's task list current so the tray's task submenu is
  // correct at startup and after task edits; the backend rebuilds the menu
  // only when the list actually changed.
  useEffect(() => {
    getBackend()
      .call('update_tasks', { tasks })
      .catch(error => console.warn('Failed to send the task list to the backend:', error));
  }, [tasks]);

  useBackendEvent(BACKEND_EVENTS.SHOW_START_TASK_DIALOG, () => onShowStartDialog());
}
