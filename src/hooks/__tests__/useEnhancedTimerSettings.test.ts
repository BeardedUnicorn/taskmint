import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEnhancedTimerSettings } from '../useEnhancedTimerSettings';
import { STORAGE_KEYS } from '../../constants';
import { DEFAULT_INACTIVITY_SETTINGS } from '../../types/timer';
import { safeInvoke } from '../../utils/tauri';

vi.mock('../../utils/tauri', () => ({
  isTauriEnvironment: vi.fn(() => true),
  safeInvoke: vi.fn().mockResolvedValue(null),
}));

const mockSafeInvoke = vi.mocked(safeInvoke);

function storeInactivitySettings(data: Record<string, unknown>) {
  window.localStorage.setItem(
    STORAGE_KEYS.INACTIVITY_SETTINGS,
    JSON.stringify({ version: 1, data, migratedAt: new Date().toISOString() })
  );
}

function storedSettings() {
  const raw = window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS);
  return raw ? JSON.parse(raw).data : null;
}

describe('useEnhancedTimerSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults to off with a 15-minute threshold', () => {
    expect(DEFAULT_INACTIVITY_SETTINGS).toEqual({ enabled: false, thresholdMinutes: 15 });
    const { result } = renderHook(() => useEnhancedTimerSettings());
    expect(result.current.inactivitySettings).toEqual({ enabled: false, thresholdMinutes: 15 });
  });

  describe('one-time switch to off by default', () => {
    it('turns a saved enabled setting off once', () => {
      storeInactivitySettings({ enabled: true, thresholdMinutes: 20 });

      const { result } = renderHook(() => useEnhancedTimerSettings());

      expect(result.current.inactivitySettings.enabled).toBe(false);
      expect(storedSettings().enabled).toBe(false);
      expect(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED)).toBe('true');
    });

    it('keeps the setting on when the user turns it back on later', () => {
      storeInactivitySettings({ enabled: true, thresholdMinutes: 20 });
      const first = renderHook(() => useEnhancedTimerSettings());
      act(() => {
        first.result.current.updateInactivitySettings({ enabled: true });
      });
      first.unmount();

      const { result } = renderHook(() => useEnhancedTimerSettings());

      expect(result.current.inactivitySettings.enabled).toBe(true);
      expect(storedSettings().enabled).toBe(true);
    });

    it('writes no settings when none were saved, only the migration flag', () => {
      renderHook(() => useEnhancedTimerSettings());

      expect(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS)).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED)).toBe('true');
    });

    it('seeds settings saved inside the old enhanced-settings blob first', () => {
      window.localStorage.setItem(
        STORAGE_KEYS.ENHANCED_TIMER_SETTINGS,
        JSON.stringify({ version: 1, data: { inactivity: { enabled: false, thresholdMinutes: 45 } } })
      );

      const { result } = renderHook(() => useEnhancedTimerSettings());

      expect(result.current.inactivitySettings).toEqual({ enabled: false, thresholdMinutes: 45 });
    });
  });

  describe('changes', () => {
    beforeEach(() => {
      window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED, 'true');
    });

    it('sends each change to the backend monitor', () => {
      const { result } = renderHook(() => useEnhancedTimerSettings());

      act(() => {
        result.current.updateInactivitySettings({ enabled: true, thresholdMinutes: 5 });
      });

      expect(mockSafeInvoke).toHaveBeenCalledWith('set_idle_settings', {
        settings: { enabled: true, thresholdMinutes: 5 },
      });
      expect(result.current.inactivitySettings).toEqual({ enabled: true, thresholdMinutes: 5 });
    });

    it('drops keys older builds saved (warning, auto-resume, testing mode) on the next save', () => {
      storeInactivitySettings({
        enabled: true,
        thresholdMinutes: 15,
        showWarningBeforePause: true,
        warningDurationSeconds: 30,
        resumeOnActivity: true,
        testingMode: true,
      });
      const { result } = renderHook(() => useEnhancedTimerSettings());

      expect(result.current.inactivitySettings).toEqual({ enabled: true, thresholdMinutes: 15 });
      act(() => {
        result.current.updateInactivitySettings({ thresholdMinutes: 10 });
      });

      expect(storedSettings()).toEqual({ enabled: true, thresholdMinutes: 10 });
    });

    it('resetting also resets the backend', () => {
      const { result } = renderHook(() => useEnhancedTimerSettings());

      act(() => {
        result.current.resetToDefaults();
      });

      expect(mockSafeInvoke).toHaveBeenCalledWith('set_idle_settings', {
        settings: { enabled: false, thresholdMinutes: 15 },
      });
    });
  });
});
