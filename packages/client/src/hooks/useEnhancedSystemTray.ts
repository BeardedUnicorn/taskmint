/**
 * System tray bridge.
 *
 * The tray itself lives in the desktop app's Rust: it reads the sessions and
 * the tasks record directly and starts/stops timers through the same
 * commands as the app (the session context reloads on the timer-instance
 * events those actions emit). The client only opens the start dialog when
 * the tray's "Choose Task…" / "Add a Task…" asks for it.
 */

import { useBackendEvent } from '../backend';
import { BACKEND_EVENTS } from '../constants/events';

export interface UseEnhancedSystemTrayProps {
  onShowStartDialog: () => void;
}

export function useEnhancedSystemTray({ onShowStartDialog }: UseEnhancedSystemTrayProps) {
  useBackendEvent(BACKEND_EVENTS.SHOW_START_TASK_DIALOG, () => onShowStartDialog());
}
