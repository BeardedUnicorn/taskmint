/**
 * The launcher's shortcuts to TaskMint (Android: long-press its icon):
 * Start for the tasks you'd most likely start (favourites first, then the
 * ones used last, as the start pickers order them), then Add time and
 * Payouts. Each opens the app for its action (LAUNCH_ACTIONS); they're set
 * again whenever they change.
 */

import { useEffect, useMemo } from 'react';
import { LAUNCH_ACTIONS } from '@taskmint/contracts';
import { getBackend } from '../backend';
import type { AppShortcut } from '../backend/types';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../contexts/TaskManagementContext';
import type { Task } from '../types/task';
import type { TaskSession } from '../types/timer';
import { orderTasksForStart } from '../utils/taskOrdering';

/** How many tasks get a Start shortcut: launchers show four or five shortcuts in all. */
export const SHORTCUT_TASKS = 3;
/** The longest labels Android's guidance keeps: a short one where there's little room, and a long one. */
const SHORT_LABEL = 10;
const LONG_LABEL = 25;

/** `text`, cut to `max` characters with an ellipsis when longer. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function appShortcuts(tasks: Task[], sessions: TaskSession[]): AppShortcut[] {
  const starts = orderTasksForStart(tasks, sessions)
    .slice(0, SHORTCUT_TASKS)
    .map(
      (task): AppShortcut => ({
        id: `task-${task.id}`,
        label: clip(task.name, SHORT_LABEL),
        longLabel: clip(`Start ${task.name}`, LONG_LABEL),
        icon: 'task',
        action: `${LAUNCH_ACTIONS.START_TASK}${task.id}`,
      })
    );
  return [
    ...starts,
    { id: 'add-time', label: 'Add time', longLabel: 'Add time', icon: 'addTime', action: LAUNCH_ACTIONS.ADD_TIME },
    { id: 'payouts', label: 'Payouts', longLabel: 'Payouts', icon: 'payouts', action: LAUNCH_ACTIONS.PAYOUTS },
  ];
}

/** Keeps the shortcuts current, once the tasks and sessions have loaded (`ready`). */
export function useAppShortcuts(ready: boolean): void {
  const { tasks } = useTaskManagementContext();
  const { sessions } = useSessionManagementContext();
  const shortcuts = useMemo(() => JSON.stringify(appShortcuts(tasks, sessions)), [tasks, sessions]);

  useEffect(() => {
    if (ready) getBackend().platform.appShortcuts?.set(JSON.parse(shortcuts));
  }, [ready, shortcuts]);
}
