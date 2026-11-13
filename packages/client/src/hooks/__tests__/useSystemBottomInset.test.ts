import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { useSystemBottomInset } from '../useSystemBottomInset';

const inset = () => document.documentElement.style.getPropertyValue('--system-bottom-inset');

describe('useSystemBottomInset', () => {
  it("puts Android's bottom inset where CSS can keep clear of it, and reads it again on a resize", () => {
    const { bottomInset } = fakeBackend().platform.systemBars;
    bottomInset.mockReturnValue(24);
    const { unmount } = renderHook(() => useSystemBottomInset());
    expect(inset()).toBe('24px');

    // Turned to landscape, say
    bottomInset.mockReturnValue(16);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(inset()).toBe('16px');

    // Switched to three-button navigation: no resize, but the system says so
    bottomInset.mockReturnValue(48);
    act(() => fakeBackend().changeInsets());
    expect(inset()).toBe('48px');

    unmount();
    expect(inset()).toBe('');
    bottomInset.mockReturnValue(0);
  });

  it('does nothing without system bars', () => {
    installFakeBackendForTest({ without: ['systemBars'] });
    renderHook(() => useSystemBottomInset());
    expect(inset()).toBe('');
  });
});
