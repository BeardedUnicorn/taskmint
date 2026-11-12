import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NavigationProvider, useNavigation } from '../NavigationContext';

describe('NavigationProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('opens on Home, with params for the page and a way to clear them', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper: NavigationProvider });
    expect(result.current.view).toBe('home');

    act(() => result.current.navigate('settings', { section: 'backups' }));
    expect(result.current.view).toBe('settings');
    expect(result.current.params).toEqual({ section: 'backups' });

    act(() => result.current.clearParams());
    expect(result.current.params).toEqual({});
  });

  it('opens on Home every time, whatever page was showing before', () => {
    // What versions before 4.4 kept to reopen the last page
    window.localStorage.setItem('activeView', JSON.stringify({ version: 1, data: 'payouts' }));
    const first = renderHook(() => useNavigation(), { wrapper: NavigationProvider });
    act(() => first.result.current.navigate('notes'));
    first.unmount();

    const second = renderHook(() => useNavigation(), { wrapper: NavigationProvider });
    expect(second.result.current.view).toBe('home');
  });

  it('counts each page opened, the one showing included', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper: NavigationProvider });
    expect(result.current.visit).toBe(0);

    act(() => result.current.navigate('payouts'));
    act(() => result.current.navigate('payouts'));
    expect(result.current.visit).toBe(2);

    // Clearing a page's params isn't a new visit
    act(() => result.current.navigate('settings', { section: 'sync' }));
    act(() => result.current.clearParams());
    expect(result.current.visit).toBe(3);
  });

  it('keeps the same value when there are no params to clear', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper: NavigationProvider });
    const before = result.current;

    act(() => result.current.clearParams());
    expect(result.current).toBe(before);
  });

  it('needs the provider', () => {
    expect(() => renderHook(() => useNavigation())).toThrow(/NavigationProvider/);
  });
});
