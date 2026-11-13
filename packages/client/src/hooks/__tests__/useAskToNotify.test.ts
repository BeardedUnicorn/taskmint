import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { askToNotify, useAskToNotifyAtFirstWork } from '../useAskToNotify';

const session = vi.hoisted(() => ({ activeSession: null as object | null, hasLoaded: false }));
vi.mock('../../contexts/SessionManagementContext', () => ({ useSessionManagementContext: () => session }));

function setSession(next: { activeSession: object | null; hasLoaded: boolean }) {
  Object.assign(session, next);
}

beforeEach(() => {
  localStorage.clear();
  fakeBackend().platform.notifications.askPermission.mockClear();
  setSession({ activeSession: null, hasLoaded: false });
});

describe('useAskToNotifyAtFirstWork', () => {
  it('asks once, when work first starts after the sessions have loaded', () => {
    const { askPermission } = fakeBackend().platform.notifications;
    const { rerender } = renderHook(() => useAskToNotifyAtFirstWork());

    setSession({ activeSession: null, hasLoaded: true });
    rerender();
    expect(askPermission).not.toHaveBeenCalled();

    setSession({ activeSession: { id: 's1' }, hasLoaded: true });
    rerender();
    expect(askPermission).toHaveBeenCalledTimes(1);

    // Ended and started again: not twice, not even after a restart
    setSession({ activeSession: null, hasLoaded: true });
    rerender();
    setSession({ activeSession: { id: 's2' }, hasLoaded: true });
    rerender();
    expect(askPermission).toHaveBeenCalledTimes(1);
  });

  it("doesn't count work already open at launch", () => {
    const { askPermission } = fakeBackend().platform.notifications;
    const { rerender } = renderHook(() => useAskToNotifyAtFirstWork());
    setSession({ activeSession: { id: 's1' }, hasLoaded: true });
    rerender();
    expect(askPermission).not.toHaveBeenCalled();
  });

  it('remembers asking on this device', () => {
    const { askPermission } = fakeBackend().platform.notifications;
    const first = renderHook(() => useAskToNotifyAtFirstWork());
    setSession({ activeSession: null, hasLoaded: true });
    first.rerender();
    setSession({ activeSession: { id: 's1' }, hasLoaded: true });
    first.rerender();
    first.unmount();

    setSession({ activeSession: null, hasLoaded: true });
    const second = renderHook(() => useAskToNotifyAtFirstWork());
    setSession({ activeSession: { id: 's2' }, hasLoaded: true });
    second.rerender();
    expect(askPermission).toHaveBeenCalledTimes(1);
  });

  it("asks nothing, and remembers nothing, where the system doesn't need asking", () => {
    installFakeBackendForTest({ without: ['laterNotifications'] });
    const { rerender } = renderHook(() => useAskToNotifyAtFirstWork());
    setSession({ activeSession: null, hasLoaded: true });
    rerender();
    setSession({ activeSession: { id: 's1' }, hasLoaded: true });
    rerender();
    expect(localStorage.length).toBe(0);
    askToNotify();
  });
});
