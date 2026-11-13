/**
 * The launcher's shortcuts: Start for the likeliest tasks, then Add time
 * and Payouts, set again as they change.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
} from '../../__tests__/setup/session-test-utils';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import type { Task } from '../../types/task';
import type { TaskSession } from '../../types/timer';
import { appShortcuts, useAppShortcuts } from '../useAppShortcuts';

const state = vi.hoisted(() => ({ tasks: [] as Task[], sessions: [] as TaskSession[] }));
vi.mock('../../contexts/TaskManagementContext', () => ({ useTaskManagementContext: () => ({ tasks: state.tasks }) }));
vi.mock('../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: state.sessions }),
}));

const fixed = [
  { id: 'add-time', label: 'Add time', longLabel: 'Add time', icon: 'addTime', action: 'add-time' },
  { id: 'payouts', label: 'Payouts', longLabel: 'Payouts', icon: 'payouts', action: 'payouts' },
];

describe('appShortcuts', () => {
  it('starts the favourite and most recent tasks, then adds time and opens Payouts', () => {
    const tasks = [
      createMockTask({ id: 'a', name: 'Annotation' }),
      createMockTask({ id: 'b', name: 'Bug bash' }),
      createMockTask({ id: 'c', name: 'Code review for the data team', isFavorite: true }),
      createMockTask({ id: 'd', name: 'Docs' }),
      createMockTask({ id: 'e', name: 'Archived', isArchived: true }),
    ];
    const used = createMockTaskSession({
      taskId: 'd',
      taskName: 'Docs',
      timerInstances: [createMockTimerInstance({ duration: 60_000 })],
    });

    expect(appShortcuts(tasks, [used])).toEqual([
      {
        id: 'task-c',
        label: 'Code revi…',
        longLabel: 'Start Code review for th…',
        icon: 'task',
        action: 'start-task:c',
      },
      { id: 'task-d', label: 'Docs', longLabel: 'Start Docs', icon: 'task', action: 'start-task:d' },
      { id: 'task-a', label: 'Annotation', longLabel: 'Start Annotation', icon: 'task', action: 'start-task:a' },
      ...fixed,
    ]);
  });

  it('has Add time and Payouts without any task', () => {
    expect(appShortcuts([], [])).toEqual(fixed);
  });
});

describe('useAppShortcuts', () => {
  beforeEach(() => {
    installFakeBackendForTest({});
    state.tasks = [createMockTask({ id: 'a', name: 'Annotation' })];
    state.sessions = [];
  });

  it('sets them once the data has loaded, and again only when they change', () => {
    const { rerender } = renderHook(({ ready }) => useAppShortcuts(ready), { initialProps: { ready: false } });
    const { set } = fakeBackend().platform.appShortcuts;
    expect(set).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0][0]).toMatchObject({ id: 'task-a' });

    rerender({ ready: true });
    expect(set).toHaveBeenCalledTimes(1);
    state.tasks = [...state.tasks, createMockTask({ id: 'b', name: 'Bug bash' })];
    rerender({ ready: true });
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('does nothing where there are no shortcuts', () => {
    installFakeBackendForTest({ without: ['appShortcuts'] });
    expect(() => renderHook(() => useAppShortcuts(true))).not.toThrow();
  });
});
