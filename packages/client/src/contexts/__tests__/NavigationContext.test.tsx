import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { NavigationProvider, useNavigation, ACTIVE_VIEW_KEY } from '../NavigationContext';
import { readLocal, writeLocal } from '../../utils/localStore';

const persisted = ({ children }: { children: ReactNode }) => (
  <NavigationProvider persist>{children}</NavigationProvider>
);

describe('NavigationProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('opens on Sessions, with params for the page and a way to clear them', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper: NavigationProvider });
    expect(result.current.view).toBe('sessions');

    act(() => result.current.navigate('settings', { section: 'backups' }));
    expect(result.current.view).toBe('settings');
    expect(result.current.params).toEqual({ section: 'backups' });

    act(() => result.current.clearParams());
    expect(result.current.params).toEqual({});
  });

  it('remembers the page across launches when asked to', () => {
    const first = renderHook(() => useNavigation(), { wrapper: persisted });
    act(() => first.result.current.navigate('payouts'));
    expect(readLocal(ACTIVE_VIEW_KEY, null)).toBe('payouts');
    first.unmount();

    const second = renderHook(() => useNavigation(), { wrapper: persisted });
    expect(second.result.current.view).toBe('payouts');
  });

  it('ignores a stored page that no longer exists', () => {
    writeLocal(ACTIVE_VIEW_KEY, 'reports', null);
    const { result } = renderHook(() => useNavigation(), { wrapper: persisted });
    expect(result.current.view).toBe('sessions');
  });

  it("doesn't remember anything unless asked", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper: NavigationProvider });
    act(() => result.current.navigate('notes'));
    expect(readLocal(ACTIVE_VIEW_KEY, null)).toBeNull();
  });
});
