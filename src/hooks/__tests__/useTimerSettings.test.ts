/**
 * Tests for useTimerSettings hook
 */

import { renderHook, act } from '@testing-library/react';
import { useTimerSettings } from '../useTimerSettings';
import { TimerRoundingOption } from '../../types/timer';

// Mock useLocalStorage
vi.mock('../useLocalStorage', async (importOriginal) => {
  const actual = await importOriginal();
  const mockSetSettings = vi.fn();
  const mockUseLocalStorage = vi.fn(() => [
    { roundingOption: 'none' },
    mockSetSettings,
  ]);
  return {
    ...actual,
    useLocalStorage: mockUseLocalStorage,
    mockSetSettings,
    mockUseLocalStorage,
  };
});

const { mockSetSettings, mockUseLocalStorage } = vi.mocked(await import('../useLocalStorage'));

// Mock constants
vi.mock('../../constants', () => ({
  STORAGE_KEYS: {
    TIMER_SETTINGS: 'timerSettings',
  },
}));

describe('useTimerSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementation
    mockUseLocalStorage.mockReturnValue([
      { roundingOption: 'none' },
      mockSetSettings,
    ]);
  });

  describe('initialization', () => {
    it('should initialize with default timer settings', () => {
      const { result } = renderHook(() => useTimerSettings());

      expect(result.current.settings).toEqual({
        roundingOption: 'none',
      });
      expect(result.current.roundingOption).toBe('none');
    });

    it('should call useLocalStorage with correct parameters', () => {
      renderHook(() => useTimerSettings());

      expect(mockUseLocalStorage).toHaveBeenCalledWith(
        'timerSettings',
        { roundingOption: 'none' }
      );
    });
  });

  describe('rounding option management', () => {
    it('should update rounding option to up-5min', () => {
      const { result } = renderHook(() => useTimerSettings());

      act(() => {
        result.current.updateRoundingOption('up-5min');
      });

      expect(mockSetSettings).toHaveBeenCalledWith(expect.any(Function));
      
      // Test the function passed to setSettings
      const updateFunction = mockSetSettings.mock.calls[0][0];
      const previousSettings = { roundingOption: 'none' };
      const newSettings = updateFunction(previousSettings);
      
      expect(newSettings).toEqual({
        roundingOption: 'up-5min',
      });
    });

    it('should update rounding option to up-15min', () => {
      const { result } = renderHook(() => useTimerSettings());

      act(() => {
        result.current.updateRoundingOption('up-15min');
      });

      expect(mockSetSettings).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetSettings.mock.calls[0][0];
      const previousSettings = { roundingOption: 'none' };
      const newSettings = updateFunction(previousSettings);
      
      expect(newSettings).toEqual({
        roundingOption: 'up-15min',
      });
    });

    it('should update rounding option to up-30min', () => {
      const { result } = renderHook(() => useTimerSettings());

      act(() => {
        result.current.updateRoundingOption('up-30min');
      });

      expect(mockSetSettings).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetSettings.mock.calls[0][0];
      const previousSettings = { roundingOption: 'none' };
      const newSettings = updateFunction(previousSettings);
      
      expect(newSettings).toEqual({
        roundingOption: 'up-30min',
      });
    });

    it('should update rounding option back to none', () => {
      // Start with a different rounding option
      mockUseLocalStorage.mockReturnValue([
        { roundingOption: 'up-15min' },
        mockSetSettings,
      ]);

      const { result } = renderHook(() => useTimerSettings());

      act(() => {
        result.current.updateRoundingOption('none');
      });

      expect(mockSetSettings).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetSettings.mock.calls[0][0];
      const previousSettings = { roundingOption: 'up-15min' };
      const newSettings = updateFunction(previousSettings);
      
      expect(newSettings).toEqual({
        roundingOption: 'none',
      });
    });
  });

  describe('settings persistence', () => {
    it('should preserve other settings when updating rounding option', () => {
      // Mock settings with additional properties (future-proofing)
      const mockSettings = {
        roundingOption: 'none' as TimerRoundingOption,
        someOtherSetting: 'value',
      };
      
      mockUseLocalStorage.mockReturnValue([
        mockSettings,
        mockSetSettings,
      ]);

      const { result } = renderHook(() => useTimerSettings());

      act(() => {
        result.current.updateRoundingOption('up-5min');
      });

      const updateFunction = mockSetSettings.mock.calls[0][0];
      const newSettings = updateFunction(mockSettings);
      
      expect(newSettings).toEqual({
        roundingOption: 'up-5min',
        someOtherSetting: 'value',
      });
    });
  });

  describe('return values', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useTimerSettings());

      expect(result.current).toHaveProperty('settings');
      expect(result.current).toHaveProperty('updateRoundingOption');
      expect(result.current).toHaveProperty('roundingOption');
    });

    it('should return updateRoundingOption as a function', () => {
      const { result } = renderHook(() => useTimerSettings());

      expect(typeof result.current.updateRoundingOption).toBe('function');
    });

    it('should return roundingOption that matches settings.roundingOption', () => {
      const mockSettings = { roundingOption: 'up-15min' as TimerRoundingOption };
      mockUseLocalStorage.mockReturnValue([mockSettings, mockSetSettings]);

      const { result } = renderHook(() => useTimerSettings());

      expect(result.current.roundingOption).toBe('up-15min');
      expect(result.current.settings.roundingOption).toBe('up-15min');
      expect(result.current.roundingOption).toBe(result.current.settings.roundingOption);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rapid updates', () => {
      const { result } = renderHook(() => useTimerSettings());

      act(() => {
        result.current.updateRoundingOption('up-5min');
        result.current.updateRoundingOption('up-15min');
        result.current.updateRoundingOption('up-30min');
      });

      expect(mockSetSettings).toHaveBeenCalledTimes(3);
    });

    it('should handle setting the same rounding option multiple times', () => {
      const { result } = renderHook(() => useTimerSettings());

      act(() => {
        result.current.updateRoundingOption('up-5min');
        result.current.updateRoundingOption('up-5min');
      });

      expect(mockSetSettings).toHaveBeenCalledTimes(2);
      
      // Both calls should result in the same setting
      const updateFunction1 = mockSetSettings.mock.calls[0][0];
      const updateFunction2 = mockSetSettings.mock.calls[1][0];
      const previousSettings = { roundingOption: 'none' };
      
      expect(updateFunction1(previousSettings)).toEqual(updateFunction2(previousSettings));
    });
  });

  describe('type safety', () => {
    it('should accept all valid TimerRoundingOption values', () => {
      const { result } = renderHook(() => useTimerSettings());
      const validOptions: TimerRoundingOption[] = ['none', 'up-5min', 'up-15min', 'up-30min'];

      validOptions.forEach(option => {
        act(() => {
          result.current.updateRoundingOption(option);
        });
      });

      expect(mockSetSettings).toHaveBeenCalledTimes(validOptions.length);
    });
  });
});