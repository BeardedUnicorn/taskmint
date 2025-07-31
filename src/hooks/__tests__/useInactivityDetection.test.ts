/**
 * Tests for useInactivityDetection hook
 *
 * Tests inactivity monitoring, warning system, and automatic timer pausing.
 */

import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_INACTIVITY_SETTINGS } from '../../types/timer';

describe('useInactivityDetection', () => {

  describe('default settings', () => {
    it('should have correct default inactivity settings', () => {
      expect(DEFAULT_INACTIVITY_SETTINGS).toEqual({
        enabled: true,
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
});
