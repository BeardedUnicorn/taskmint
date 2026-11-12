import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NavigationProvider, useNavigation } from '../../contexts/NavigationContext';
import { isAnalyticsEnabled, setAnalyticsEnabled, useAnalyticsScreens } from '../analytics';
import { fakeBackend, installFakeBackendForTest } from '../../testing';

function useScreens() {
  useAnalyticsScreens();
  return useNavigation();
}

describe('usage analytics', () => {
  it('are on until turned off, and follow the choice', () => {
    localStorage.clear();
    const { analytics } = fakeBackend().platform;
    expect(isAnalyticsEnabled()).toBe(true);
    setAnalyticsEnabled(false);
    expect(isAnalyticsEnabled()).toBe(false);
    expect(analytics.setEnabled).toHaveBeenLastCalledWith(false);
  });

  it('count each page opened, and nothing once turned off', () => {
    localStorage.clear();
    const { analytics } = fakeBackend().platform;
    const { result } = renderHook(useScreens, { wrapper: NavigationProvider });
    expect(analytics.setEnabled).toHaveBeenCalledWith(true);
    expect(analytics.screen).toHaveBeenLastCalledWith('home');
    act(() => result.current.navigate('tasks'));
    expect(analytics.screen).toHaveBeenLastCalledWith('tasks');

    setAnalyticsEnabled(false);
    act(() => result.current.navigate('notes'));
    expect(analytics.screen).toHaveBeenCalledTimes(2);
  });

  it('are nothing where the shell has none', () => {
    installFakeBackendForTest({ without: ['analytics'] });
    renderHook(useScreens, { wrapper: NavigationProvider });
    setAnalyticsEnabled(true);
  });
});
