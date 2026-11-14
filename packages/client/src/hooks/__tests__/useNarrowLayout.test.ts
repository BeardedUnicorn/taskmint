import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNarrowLayout } from '../useCompactLayout';
import { setPhoneViewport, setWindowWidth } from '../../__tests__/setup/viewport';

describe('useNarrowLayout', () => {
  it('is false in a window with room for two panes', () => {
    setWindowWidth(1440);
    expect(renderHook(() => useNarrowLayout()).result.current).toBe(false);
  });

  it('is true in a window under 1100px, and on every phone', () => {
    setWindowWidth(1000);
    expect(renderHook(() => useNarrowLayout()).result.current).toBe(true);
    setPhoneViewport();
    expect(renderHook(() => useNarrowLayout()).result.current).toBe(true);
  });

  it('takes the width a wider table needs', () => {
    setWindowWidth(1200);
    expect(renderHook(() => useNarrowLayout()).result.current).toBe(false);
    expect(renderHook(() => useNarrowLayout(1360)).result.current).toBe(true);
  });
});
