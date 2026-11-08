import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prepareInactivitySettings, useEnhancedTimerSettings } from '../useEnhancedTimerSettings';
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

      expect(result.current.inactivitySettings).toEqual({ enabled: false, thresholdMinutes: 45, longRunHours: 4 });
    });
  });

  describe('settings older builds saved', () => {
    it('seeds the settings from the old combined blob, versioned or not', () => {
      window.localStorage.setItem(
        STORAGE_KEYS.ENHANCED_TIMER_SETTINGS,
        JSON.stringify({ inactivity: { thresholdMinutes: 20 } })
      );
      prepareInactivitySettings();
      expect(storedSettings()).toMatchObject({ thresholdMinutes: 20, enabled: false });
    });

    it("seeds nothing from a blob without inactivity settings, or one it can't read", () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      window.localStorage.setItem(
        STORAGE_KEYS.ENHANCED_TIMER_SETTINGS,
        JSON.stringify({ version: 1, data: { theme: 'dark' } })
      );
      prepareInactivitySettings();
      expect(storedSettings()).toBeNull();

      window.localStorage.clear();
      window.localStorage.setItem(STORAGE_KEYS.ENHANCED_TIMER_SETTINGS, '{not json');
      prepareInactivitySettings();
      expect(error).toHaveBeenCalledWith('Failed to migrate legacy inactivity settings:', expect.any(SyntaxError));
      error.mockRestore();
    });

    it("turns off detection saved unversioned, and gets past settings it can't read", () => {
      window.localStorage.setItem(
        STORAGE_KEYS.INACTIVITY_SETTINGS,
        JSON.stringify({ enabled: true, thresholdMinutes: 10 })
      );
      prepareInactivitySettings();
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS)!)).toEqual({
        enabled: false,
        thresholdMinutes: 10,
      });

      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      window.localStorage.clear();
      window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_SETTINGS, '{not json');
      prepareInactivitySettings();
      expect(error).toHaveBeenCalledWith(
        'Failed to apply the inactivity default-off migration:',
        expect.any(SyntaxError)
      );
      error.mockRestore();
    });

    it('fills in fields a partial save left out', () => {
      storeInactivitySettings({ longRunHours: 6 });
      window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED, 'true');
      const { result } = renderHook(() => useEnhancedTimerSettings());
      expect(result.current.inactivitySettings).toEqual({ enabled: false, thresholdMinutes: 15, longRunHours: 6 });
    });
  });

  describe('changes', () => {
    beforeEach(() => {
      window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED, 'true');
    });

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
