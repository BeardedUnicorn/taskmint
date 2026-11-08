import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEnhancedTimerSettings } from '../useEnhancedTimerSettings';
import { STORAGE_KEYS } from '../../constants';
import { DEFAULT_INACTIVITY_SETTINGS } from '../../types/timer';
import { fakeBackend, installFakeBackendForTest } from '../../testing';

const setIdleSettings = () => fakeBackend().platform.idle.setSettings;

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
    expect(DEFAULT_INACTIVITY_SETTINGS).toEqual({ enabled: false, thresholdMinutes: 15, longRunHours: 4 });
    const { result } = renderHook(() => useEnhancedTimerSettings());
    expect(result.current.inactivitySettings).toEqual({ enabled: false, thresholdMinutes: 15, longRunHours: 4 });
  });

  it('keeps a saved enabled setting', () => {
    storeInactivitySettings({ enabled: true, thresholdMinutes: 20 });

    const { result } = renderHook(() => useEnhancedTimerSettings());

    expect(result.current.inactivitySettings).toEqual({ enabled: true, thresholdMinutes: 20, longRunHours: 4 });
  });

  describe('settings older builds saved', () => {
    it('fills in fields a partial save left out', () => {
      storeInactivitySettings({ longRunHours: 6 });
      const { result } = renderHook(() => useEnhancedTimerSettings());
      expect(result.current.inactivitySettings).toEqual({ enabled: false, thresholdMinutes: 15, longRunHours: 6 });
    });
  });

  describe('changes', () => {
    it('sends each change to the idle monitor', () => {
      const { result } = renderHook(() => useEnhancedTimerSettings());

      act(() => {
        result.current.updateInactivitySettings({ enabled: true, thresholdMinutes: 5 });
      });

      expect(setIdleSettings()).toHaveBeenCalledWith({ enabled: true, thresholdMinutes: 5, longRunHours: 4 });
      expect(result.current.inactivitySettings).toEqual({ enabled: true, thresholdMinutes: 5, longRunHours: 4 });
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

      expect(result.current.inactivitySettings).toEqual({ enabled: true, thresholdMinutes: 15, longRunHours: 4 });
      act(() => {
        result.current.updateInactivitySettings({ thresholdMinutes: 10 });
      });

      expect(storedSettings()).toEqual({ enabled: true, thresholdMinutes: 10, longRunHours: 4 });
    });

    it('resetting also resets the idle monitor', () => {
      const { result } = renderHook(() => useEnhancedTimerSettings());

      act(() => {
        result.current.resetToDefaults();
      });

      expect(setIdleSettings()).toHaveBeenCalledWith({ enabled: false, thresholdMinutes: 15, longRunHours: 4 });
    });

    it('logs settings the idle monitor refused', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setIdleSettings().mockRejectedValueOnce('monitor stopped');
      const { result } = renderHook(() => useEnhancedTimerSettings());

      act(() => {
        result.current.updateInactivitySettings({ enabled: true });
      });

      await waitFor(() => expect(warn).toHaveBeenCalledWith('Failed to send the idle settings:', 'monitor stopped'));
      warn.mockRestore();
    });

    it('saves the settings where the platform has no idle monitor', () => {
      installFakeBackendForTest({ without: ['idle'] });
      const { result } = renderHook(() => useEnhancedTimerSettings());

      act(() => {
        result.current.updateInactivitySettings({ thresholdMinutes: 25 });
      });

      expect(storedSettings().thresholdMinutes).toBe(25);
    });
  });
});
