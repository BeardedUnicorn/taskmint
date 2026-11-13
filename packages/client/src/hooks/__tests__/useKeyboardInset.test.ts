import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { useKeyboardInset } from '../useKeyboardInset';

/** A visual viewport the test moves, as a keyboard or a pinch would. */
function stubViewport(start: { height: number; offsetTop?: number; scale?: number }) {
  const target = new EventTarget();
  const viewport = Object.assign(target, { offsetTop: 0, scale: 1, ...start });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 914);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return {
    move(next: { height: number; offsetTop?: number; scale?: number }, event = 'resize') {
      Object.assign(viewport, { offsetTop: 0, scale: 1, ...next });
      act(() => {
        target.dispatchEvent(new Event(event));
      });
    },
  };
}

const inset = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('useKeyboardInset', () => {
  it('tells the page where the keyboard leaves room, and forgets it when it goes', () => {
    const viewport = stubViewport({ height: 914 });
    const { unmount } = renderHook(() => useKeyboardInset());
    expect(inset('--keyboard-top')).toBe('0px');
    expect(inset('--keyboard-bottom')).toBe('0px');

    // The keyboard opens
    viewport.move({ height: 577.9 });
    expect(inset('--keyboard-bottom')).toBe('336px');

    // The browser scrolls the field into view
    viewport.move({ height: 577.9, offsetTop: 40 }, 'scroll');
    expect(inset('--keyboard-top')).toBe('40px');
    expect(inset('--keyboard-bottom')).toBe('296px');

    // A pinch shrinks the viewport, but no keyboard came
    viewport.move({ height: 457, offsetTop: 100, scale: 2 });
    expect(inset('--keyboard-top')).toBe('0px');
    expect(inset('--keyboard-bottom')).toBe('0px');

    unmount();
    expect(inset('--keyboard-bottom')).toBe('');
    viewport.move({ height: 500 });
    expect(inset('--keyboard-bottom')).toBe('');
  });

  it("takes Android's own word for the keyboard where the webview doesn't shrink its viewport", () => {
    stubViewport({ height: 914 });
    const { keyboardInset } = fakeBackend().platform.systemBars;
    const { unmount } = renderHook(() => useKeyboardInset());
    expect(inset('--keyboard-bottom')).toBe('0px');

    keyboardInset.mockReturnValue(320.4);
    act(() => fakeBackend().changeInsets());
    expect(inset('--keyboard-bottom')).toBe('320px');

    keyboardInset.mockReturnValue(0);
    act(() => fakeBackend().changeInsets());
    expect(inset('--keyboard-bottom')).toBe('0px');
    unmount();
  });

  it('goes by the system alone without a visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { keyboardInset } = fakeBackend().platform.systemBars;
    keyboardInset.mockReturnValue(300);
    onTestFinished(() => {
      keyboardInset.mockReturnValue(0);
    });
    renderHook(() => useKeyboardInset());
    expect(inset('--keyboard-top')).toBe('0px');
    expect(inset('--keyboard-bottom')).toBe('300px');
  });

  it('does nothing with neither a visual viewport nor system bars', () => {
    installFakeBackendForTest({ without: ['systemBars'] });
    vi.stubGlobal('visualViewport', undefined);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    renderHook(() => useKeyboardInset());
    expect(inset('--keyboard-bottom')).toBe('');
  });

  it('reads the viewport alone without system bars', () => {
    installFakeBackendForTest({ without: ['systemBars'] });
    const viewport = stubViewport({ height: 914 });
    renderHook(() => useKeyboardInset());
    viewport.move({ height: 600 });
    expect(inset('--keyboard-bottom')).toBe('314px');
  });
});
