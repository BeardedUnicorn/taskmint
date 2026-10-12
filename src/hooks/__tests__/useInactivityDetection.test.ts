/**
 * Tests for useInactivityDetection hook
 *
 * Tests inactivity monitoring, warning system, and automatic timer pausing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInactivityDetection } from '../useInactivityDetection';
import { DEFAULT_INACTIVITY_SETTINGS } from '../../types/timer';
import { STORAGE_KEYS } from '../../constants';

describe('useInactivityDetection', () => {

  describe('default settings', () => {
    it('should have correct default inactivity settings', () => {
      expect(DEFAULT_INACTIVITY_SETTINGS).toEqual({
        enabled: false,
        thresholdMinutes: 15,
        showWarningBeforePause: true,
        warningDurationSeconds: 30,
        resumeOnActivity: false,
        testingMode: false,
      });
    });

    it('should validate threshold range', () => {
      expect(DEFAULT_INACTIVITY_SETTINGS.thresholdMinutes).toBeGreaterThan(0);
      expect(DEFAULT_INACTIVITY_SETTINGS.thresholdMinutes).toBeLessThanOrEqual(120);
    });

    it('should validate warning duration range', () => {
      expect(DEFAULT_INACTIVITY_SETTINGS.warningDurationSeconds).toBeGreaterThanOrEqual(5);
      expect(DEFAULT_INACTIVITY_SETTINGS.warningDurationSeconds).toBeLessThanOrEqual(60);
    });
  });

  describe('settings validation', () => {
    it('should validate custom settings structure', () => {
      const customSettings = {
        enabled: false,
        thresholdMinutes: 30,
        showWarningBeforePause: false,
        warningDurationSeconds: 10,
        resumeOnActivity: true,
      };

      expect(customSettings.thresholdMinutes).toBeGreaterThan(0);
      expect(customSettings.warningDurationSeconds).toBeGreaterThanOrEqual(5);
      expect(typeof customSettings.enabled).toBe('boolean');
      expect(typeof customSettings.showWarningBeforePause).toBe('boolean');
      expect(typeof customSettings.resumeOnActivity).toBe('boolean');
    });

    it('should handle edge case settings', () => {
      const edgeCaseSettings = {
        enabled: true,
        thresholdMinutes: 1, // minimum
        showWarningBeforePause: true,
        warningDurationSeconds: 60, // maximum
        resumeOnActivity: false,
      };

      expect(edgeCaseSettings.thresholdMinutes).toBe(1);
      expect(edgeCaseSettings.warningDurationSeconds).toBe(60);
    });
  });

  describe('off by default', () => {
    beforeEach(() => {
      window.localStorage.clear();
      vi.useFakeTimers();
    });

    afterEach(() => {
      act(() => {
        vi.runOnlyPendingTimers();
      });
      vi.useRealTimers();
      window.localStorage.clear();
    });

    function pauseEventsFrom(spy: ReturnType<typeof vi.spyOn>) {
      return spy.mock.calls
        .map(([event]) => event as CustomEvent)
        .filter(event => event.type === 'timer-pause-inactivity');
    }

    function storeInactivitySettings(enabled: boolean) {
      window.localStorage.setItem(
        STORAGE_KEYS.INACTIVITY_SETTINGS,
        JSON.stringify({
          version: 1,
          data: { ...DEFAULT_INACTIVITY_SETTINGS, enabled },
          migratedAt: new Date().toISOString(),
        })
      );
    }

    function storedEnabled(): boolean {
      const raw = window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS);
      return JSON.parse(raw!).data.enabled;
    }

    it('never pauses on a fresh install, however long the user is idle', () => {
      const { result } = renderHook(() => useInactivityDetection());
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        vi.advanceTimersByTime(60 * 60_000);
      });

      expect(result.current.settings.enabled).toBe(false);
      expect(pauseEventsFrom(dispatchSpy)).toHaveLength(0);
      expect(result.current.isWarningShown).toBe(false);
    });

    it('turns a saved enabled setting off once', () => {
      storeInactivitySettings(true);

      const { result } = renderHook(() => useInactivityDetection());

      expect(result.current.settings.enabled).toBe(false);
      expect(storedEnabled()).toBe(false);
      expect(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED)).toBe('true');
    });

    it('keeps the setting on when the user turns it back on later', () => {
      storeInactivitySettings(true);
      const first = renderHook(() => useInactivityDetection());
      act(() => {
        first.result.current.updateSettings({ enabled: true });
      });
      first.unmount();

      const { result } = renderHook(() => useInactivityDetection());

      expect(result.current.settings.enabled).toBe(true);
      expect(storedEnabled()).toBe(true);
    });

    it('writes no settings when none were saved, only the migration flag', () => {
      renderHook(() => useInactivityDetection());

      expect(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS)).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED)).toBe('true');
    });
  });

  describe('auto-pause and resumeOnActivity', () => {
    beforeEach(() => {
      window.localStorage.clear();
      vi.useFakeTimers();
    });

    afterEach(() => {
      act(() => {
        vi.runOnlyPendingTimers();
      });
      vi.useRealTimers();
      window.localStorage.clear();
    });

    // Threshold 1 minute, no warning dialog: the periodic check auto-pauses
    // directly once 60s pass without activity.
    function setupDetector(resumeOnActivity: boolean) {
      const { result } = renderHook(() => useInactivityDetection());
      act(() => {
        result.current.updateSettings({
          enabled: true,
          thresholdMinutes: 1,
          showWarningBeforePause: false,
          resumeOnActivity,
          testingMode: false,
        });
      });
      return result;
    }

    it('dispatches the pause event after the inactivity threshold', () => {
      setupDetector(false);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        vi.advanceTimersByTime(61_000);
      });

      const pauseEvents = dispatchSpy.mock.calls
        .map(([event]) => event as CustomEvent)
        .filter(event => event.type === 'timer-pause-inactivity');
      expect(pauseEvents).toHaveLength(1);
      expect(pauseEvents[0].detail.reason).toBe('inactivity');
    });

    it('dispatches timer-resume-activity when activity returns and the setting is on', () => {
      setupDetector(true);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        vi.advanceTimersByTime(61_000); // auto-pause fires
      });

      act(() => {
        document.dispatchEvent(new Event('mousedown')); // user is back
      });

      const resumeEvents = dispatchSpy.mock.calls
        .map(([event]) => event as CustomEvent)
        .filter(event => event.type === 'timer-resume-activity');
      expect(resumeEvents).toHaveLength(1);
      expect(resumeEvents[0].detail.reason).toBe('activity-detected');
    });

    it('does not dispatch timer-resume-activity when the setting is off', () => {
      setupDetector(false);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        vi.advanceTimersByTime(61_000);
      });

      act(() => {
        document.dispatchEvent(new Event('mousedown'));
      });

      const resumeEvents = dispatchSpy.mock.calls
        .map(([event]) => event as CustomEvent)
        .filter(event => event.type === 'timer-resume-activity');
      expect(resumeEvents).toHaveLength(0);
    });

    it('ignores a saved Testing Mode in release builds', () => {
      vi.stubEnv('DEV', false);
      const { result } = renderHook(() => useInactivityDetection());
      act(() => {
        result.current.updateSettings({
          enabled: true,
          thresholdMinutes: 15,
          showWarningBeforePause: false,
          resumeOnActivity: false,
          testingMode: true, // would shorten 15 minutes to 1 in a dev build
        });
      });
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        vi.advanceTimersByTime(2 * 60_000);
      });

      const pauseEvents = dispatchSpy.mock.calls
        .map(([event]) => event as CustomEvent)
        .filter(event => event.type === 'timer-pause-inactivity');
      expect(pauseEvents).toHaveLength(0);
      vi.unstubAllEnvs();
    });

    it('does not re-dispatch resume on further activity after the first return', () => {
      setupDetector(true);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      act(() => {
        document.dispatchEvent(new Event('mousedown'));
      });
      act(() => {
        document.dispatchEvent(new Event('mousedown'));
        document.dispatchEvent(new Event('keypress'));
      });

      const resumeEvents = dispatchSpy.mock.calls
        .map(([event]) => event as CustomEvent)
        .filter(event => event.type === 'timer-resume-activity');
      expect(resumeEvents).toHaveLength(1);
    });
  });
});
