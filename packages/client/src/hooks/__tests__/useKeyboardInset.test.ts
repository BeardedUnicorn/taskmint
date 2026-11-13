import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
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

  it('does nothing without a visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    renderHook(() => useKeyboardInset());
    expect(inset('--keyboard-bottom')).toBe('');
  });
});
