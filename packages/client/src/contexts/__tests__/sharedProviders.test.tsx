/**
 * The providers that hold one shared instance of a hook's state: every
 * consumer under a provider reads the same value, and a consumer outside one
 * is a mistake that fails loudly.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { ActiveTimerProvider, useActiveTimer } from '../ActiveTimerContext';
import { SessionManagementProvider, useSessionManagementContext } from '../SessionManagementContext';
import { TaskManagementProvider, useTaskManagementContext } from '../TaskManagementContext';
import { createMockTimerInstance } from '../../__tests__/setup/session-test-utils';
import { fakeBackend } from '../../testing';

vi.mock('../NotificationContext', () => ({
  useNotification: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn() }),
}));

describe('ActiveTimerProvider', () => {
  it('shares the running timer', () => {
    const { result } = renderHook(() => useActiveTimer(), { wrapper: ActiveTimerProvider });
    const timer = createMockTimerInstance();

    act(() => result.current.setActiveTimer(timer));
    expect(result.current.activeTimer).toBe(timer);
  });

  it('needs the provider', () => {
    expect(() => renderHook(() => useActiveTimer())).toThrow(/ActiveTimerProvider/);
  });
});

describe('SessionManagementProvider', () => {
  it("shares the sessions the backend sent", async () => {
    fakeBackend().call.mockImplementation(async (command: string) =>
      command === 'get_sessions' ? [] : null
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ActiveTimerProvider>
        <SessionManagementProvider>{children}</SessionManagementProvider>
      </ActiveTimerProvider>
    );
    const { result } = renderHook(() => useSessionManagementContext(), { wrapper });

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.sessions).toEqual([]);
  });

  it('needs the provider', () => {
    expect(() => renderHook(() => useSessionManagementContext())).toThrow(/SessionManagementProvider/);
  });
});

describe('TaskManagementProvider', () => {
  it('shares the tasks', async () => {
    const { result } = renderHook(() => useTaskManagementContext(), { wrapper: TaskManagementProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tasks).toEqual([]);
  });

  it('needs the provider', () => {
    expect(() => renderHook(() => useTaskManagementContext())).toThrow(/TaskManagementProvider/);
  });
});
