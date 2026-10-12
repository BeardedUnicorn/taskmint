/**
 * System tray bridge.
 *
 * The tray itself lives in Rust: it reads sessions directly and starts/stops
 * timers through the same session logic as the app (the session context
 * reloads on the timer-instance events those actions emit). The frontend only
 * mirrors the task list for the tray's Start submenu and opens the start
 * dialog when the tray's "Choose Task…" / "Add a Task…" asks for it.
 */

import { useEffect } from 'react';
import { Task } from '../types/task';
import { safeInvoke, safeListen, isTauriEnvironment } from '../utils/tauri';

export interface UseEnhancedSystemTrayProps {
  tasks: Task[];
  onShowStartDialog: () => void;
}

export function useEnhancedSystemTray({ tasks, onShowStartDialog }: UseEnhancedSystemTrayProps) {
  // Keep the backend's task list current so the tray's task submenu is
  // correct at startup and after task edits; the backend rebuilds the menu
  // only when the list actually changed.
  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }
    safeInvoke('update_tasks', { tasks });
  }, [tasks]);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;
    safeListen('show-start-task-dialog', () => onShowStartDialog()).then(fn => {
      // Torn down while registering: unlisten now instead of leaking a
      // listener that would open the dialog once more per click.
      if (cancelled) {
        fn?.();
      } else {
        unlisten = fn ?? null;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onShowStartDialog]);
}
