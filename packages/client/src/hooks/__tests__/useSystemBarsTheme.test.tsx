import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';
import { useSystemBarsTheme } from '../useSystemBarsTheme';

/** The system's dark-mode query answering `dark`, with a way to change it. */
function systemPrefers(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: dark,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  } as unknown as MediaQueryList);
  return (nowDark: boolean) => listeners.forEach(listener => listener({ matches: nowDark } as MediaQueryListEvent));
}

const themed = () =>
  renderHook(
    () => {
      useSystemBarsTheme();
      return useTheme();
    },
    { wrapper: ThemeProvider }
  );

describe('useSystemBarsTheme', () => {
  it("gives a phone's status bar the theme that shows, each time it changes", () => {
    window.localStorage.clear();
    const systemChanges = systemPrefers(false);
    const { setTheme } = fakeBackend().platform.systemBars;
    setTheme.mockClear();

    const { result } = themed();
    expect(setTheme.mock.calls).toEqual([['dark']]);

    act(() => result.current.setMode('light'));
    // System mode while the system is light: still light, nothing to send
    act(() => result.current.setMode('system'));
    act(() => systemChanges(true));

    expect(setTheme.mock.calls).toEqual([['dark'], ['light'], ['dark']]);
  });

  it('does nothing where the platform has no status bar', () => {
    installFakeBackendForTest({ without: ['systemBars'] });
    expect(themed().result.current.isDark).toBe(true);
  });
});
