/**
 * Tests for useDashboardSettings hook
 */

import { renderHook, act } from '@testing-library/react';
import { useDashboardSettings } from '../useDashboardSettings';
import { DashboardWidgetId, DashboardWidgetConfig } from '../../types/ui';

// Mock useLocalStorage
vi.mock('../useLocalStorage', async (importOriginal) => {
  const actual = await importOriginal();
  const mockSetPreferences = vi.fn();
  const mockUseLocalStorage = vi.fn();
  return {
    ...actual,
    useLocalStorage: mockUseLocalStorage,
    mockSetPreferences,
    mockUseLocalStorage,
  };
});

const { mockUseLocalStorage, mockSetPreferences } = vi.mocked(await import('../useLocalStorage'));

// Mock console.log to avoid noise in tests
const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = vi.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
});

describe('useDashboardSettings', () => {
  // A fully-migrated (v2) store: only the widgets the Sessions page renders.
  const defaultPreferences = {
    widgets: [
      { id: 'total-time-today', enabled: true, order: 1 },
      { id: 'earnings-today', enabled: true, order: 2 },
    ],
    migrationVersion: 2,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockUseLocalStorage.mockReturnValue([
      defaultPreferences,
      mockSetPreferences,
    ]);
  });

  describe('initialization', () => {
    it('should initialize with default preferences', () => {
      const { result } = renderHook(() => useDashboardSettings());

      expect(result.current.preferences).toEqual(defaultPreferences);
    });

    it('should call useLocalStorage with correct parameters', () => {
      renderHook(() => useDashboardSettings());

      expect(mockUseLocalStorage).toHaveBeenCalledWith(
        'dashboardWidgetPrefs',
        expect.objectContaining({
          widgets: expect.any(Array),
          migrationVersion: 2,
        })
      );
    });
  });

  describe('widget queries', () => {
    it('should return all available widgets', () => {
      const { result } = renderHook(() => useDashboardSettings());
      const availableWidgets = result.current.getAvailableWidgets();

      expect(availableWidgets).toHaveLength(2);
      expect(availableWidgets.map(w => w.id)).toEqual([
        'total-time-today',
        'earnings-today',
      ]);
    });

    it('should return enabled widgets sorted by order', () => {
      const { result } = renderHook(() => useDashboardSettings());
      const enabledWidgets = result.current.getEnabledWidgets();

      expect(enabledWidgets).toHaveLength(2);
      expect(enabledWidgets.map(w => w.id)).toEqual([
        'total-time-today',
        'earnings-today',
      ]);
    });

    it('should filter out disabled widgets', () => {
      const preferencesWithDisabled = {
        ...defaultPreferences,
        widgets: [
          { id: 'total-time-today', enabled: true, order: 1 },
          { id: 'earnings-today', enabled: false, order: 2 },
        ],
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithDisabled,
        mockSetPreferences,
      ]);

      const { result } = renderHook(() => useDashboardSettings());
      const enabledWidgets = result.current.getEnabledWidgets();

      expect(enabledWidgets).toHaveLength(1);
      expect(enabledWidgets.map(w => w.id)).toEqual([
        'total-time-today',
      ]);
    });

    it('should check if specific widget is enabled', () => {
      const { result } = renderHook(() => useDashboardSettings());

      expect(result.current.isWidgetEnabled('total-time-today')).toBe(true);
      expect(result.current.isWidgetEnabled('earnings-today')).toBe(true);
    });

    it('should return false for non-existent widget', () => {
      const { result } = renderHook(() => useDashboardSettings());

      expect(result.current.isWidgetEnabled('non-existent' as DashboardWidgetId)).toBe(false);
    });

    it('should get widget configuration by ID', () => {
      const { result } = renderHook(() => useDashboardSettings());
      const config = result.current.getWidgetConfig('total-time-today');

      expect(config).toEqual({
        id: 'total-time-today',
        enabled: true,
        order: 1,
      });
    });

    it('should get widget metadata by ID', () => {
      const { result } = renderHook(() => useDashboardSettings());
      const metadata = result.current.getWidgetMetadata('total-time-today');

      expect(metadata).toEqual(
        expect.objectContaining({
          id: 'total-time-today',
          title: 'Total Time',
          description: expect.any(String),
          defaultEnabled: true,
          defaultOrder: 1,
        })
      );
    });
  });

  describe('widget management', () => {
    it('should toggle widget from enabled to disabled', () => {
      const { result } = renderHook(() => useDashboardSettings());

      act(() => {
        result.current.toggleWidget('total-time-today');
      });

      expect(mockSetPreferences).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetPreferences.mock.calls[0][0];
      const newPreferences = updateFunction(defaultPreferences);
      
      const updatedWidget = newPreferences.widgets.find((w: any) => w.id === 'total-time-today');
      expect(updatedWidget.enabled).toBe(false);
    });

    it('should toggle widget from disabled to enabled', () => {
      const preferencesWithDisabled = {
        ...defaultPreferences,
        widgets: [
          { id: 'total-time-today', enabled: false, order: 1 },
          { id: 'earnings-today', enabled: true, order: 2 },
        ],
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithDisabled,
        mockSetPreferences,
      ]);

      const { result } = renderHook(() => useDashboardSettings());

      act(() => {
        result.current.toggleWidget('total-time-today');
      });

      const updateFunction = mockSetPreferences.mock.calls[0][0];
      const newPreferences = updateFunction(preferencesWithDisabled);
      
      const updatedWidget = newPreferences.widgets.find((w: any) => w.id === 'total-time-today');
      expect(updatedWidget.enabled).toBe(true);
    });

    it('should update widget order', () => {
      const { result } = renderHook(() => useDashboardSettings());

      act(() => {
        result.current.updateWidgetOrder('total-time-today', 10);
      });

      expect(mockSetPreferences).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetPreferences.mock.calls[0][0];
      const newPreferences = updateFunction(defaultPreferences);
      
      const updatedWidget = newPreferences.widgets.find((w: any) => w.id === 'total-time-today');
      expect(updatedWidget.order).toBe(10);
    });

    it('should bulk update widget preferences', () => {
      const { result } = renderHook(() => useDashboardSettings());
      const newWidgets: DashboardWidgetConfig[] = [
        { id: 'total-time-today', enabled: false, order: 5 },
        { id: 'earnings-today', enabled: true, order: 1 },
      ];

      act(() => {
        result.current.updateWidgetPreferences(newWidgets);
      });

      expect(mockSetPreferences).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetPreferences.mock.calls[0][0];
      const newPreferences = updateFunction(defaultPreferences);
      
      expect(newPreferences.widgets).toEqual(newWidgets);
    });

    it('should reset to default preferences', () => {
      const { result } = renderHook(() => useDashboardSettings());

      act(() => {
        result.current.resetToDefaults();
      });

      expect(mockSetPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          widgets: expect.any(Array),
          migrationVersion: 2,
        })
      );
    });
  });

  describe('return values', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useDashboardSettings());

      // State
      expect(result.current).toHaveProperty('preferences');
      
      // Widget queries
      expect(result.current).toHaveProperty('getAvailableWidgets');
      expect(result.current).toHaveProperty('getEnabledWidgets');
      expect(result.current).toHaveProperty('isWidgetEnabled');
      expect(result.current).toHaveProperty('getWidgetConfig');
      expect(result.current).toHaveProperty('getWidgetMetadata');
      
      // Widget management
      expect(result.current).toHaveProperty('toggleWidget');
      expect(result.current).toHaveProperty('updateWidgetOrder');
      expect(result.current).toHaveProperty('updateWidgetPreferences');
      expect(result.current).toHaveProperty('resetToDefaults');
    });

    it('should return functions for all management methods', () => {
      const { result } = renderHook(() => useDashboardSettings());

      expect(typeof result.current.getAvailableWidgets).toBe('function');
      expect(typeof result.current.getEnabledWidgets).toBe('function');
      expect(typeof result.current.isWidgetEnabled).toBe('function');
      expect(typeof result.current.getWidgetConfig).toBe('function');
      expect(typeof result.current.getWidgetMetadata).toBe('function');
      expect(typeof result.current.toggleWidget).toBe('function');
      expect(typeof result.current.updateWidgetOrder).toBe('function');
      expect(typeof result.current.updateWidgetPreferences).toBe('function');
      expect(typeof result.current.resetToDefaults).toBe('function');
    });
  });

  describe('widget migration logic', () => {
    it('should not run migration when version is current', () => {
      const preferencesWithCurrentVersion = {
        ...defaultPreferences,
        migrationVersion: 2,
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithCurrentVersion,
        mockSetPreferences,
      ]);

      renderHook(() => useDashboardSettings());

      // Should not call setPreferences for migration
      expect(mockSetPreferences).not.toHaveBeenCalled();
    });

    it('should add missing widgets during migration', () => {
      const preferencesWithMissingWidgets = {
        widgets: [
          { id: 'total-time-today', enabled: true, order: 1 },
        ],
        migrationVersion: 0,
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithMissingWidgets,
        mockSetPreferences,
      ]);

      renderHook(() => useDashboardSettings());

      expect(mockSetPreferences).toHaveBeenCalled();

      const updateFunction = mockSetPreferences.mock.calls[0][0];
      const newPreferences = updateFunction(preferencesWithMissingWidgets);

      // Should have both default widgets
      expect(newPreferences.migrationVersion).toBe(2);
      expect(newPreferences.widgets).toHaveLength(2);

      // Should preserve existing widget
      const existingWidget = newPreferences.widgets.find((w: any) => w.id === 'total-time-today');
      expect(existingWidget).toEqual({ id: 'total-time-today', enabled: true, order: 1 });

      // Should add missing widgets with default settings
      const newWidget = newPreferences.widgets.find((w: any) => w.id === 'earnings-today');
      expect(newWidget).toEqual({ id: 'earnings-today', enabled: true, order: 2 });
    });

    it('should prune stored widgets that no longer exist (v2 migration)', () => {
      // A v1 store still carrying the removed renderer-less widgets, with
      // user customizations on the survivors.
      const v1Preferences = {
        widgets: [
          { id: 'total-time-today', enabled: false, order: 7 },
          { id: 'earnings-today', enabled: true, order: 2 },
          { id: 'tasks-worked-on', enabled: true, order: 3 },
          { id: 'todays-entries', enabled: true, order: 5 },
          { id: 'daily-goal-progress', enabled: true, order: 4 },
        ],
        migrationVersion: 1,
      };

      mockUseLocalStorage.mockReturnValue([
        v1Preferences,
        mockSetPreferences,
      ]);

      renderHook(() => useDashboardSettings());

      expect(mockSetPreferences).toHaveBeenCalled();

      const updateFunction = mockSetPreferences.mock.calls[0][0];
      const newPreferences = updateFunction(v1Preferences);

      expect(newPreferences.migrationVersion).toBe(2);
      // Orphans pruned, user customizations preserved.
      expect(newPreferences.widgets).toEqual([
        { id: 'total-time-today', enabled: false, order: 7 },
        { id: 'earnings-today', enabled: true, order: 2 },
      ]);

      // Idempotent: re-running against the migrated store changes nothing.
      expect(updateFunction(newPreferences).widgets).toEqual(newPreferences.widgets);
    });

    it('should handle missing migrationVersion property', () => {
      const preferencesWithoutVersion = {
        widgets: [
          { id: 'total-time-today', enabled: true, order: 1 },
        ],
        // migrationVersion is undefined
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithoutVersion,
        mockSetPreferences,
      ]);

      renderHook(() => useDashboardSettings());

      // Should treat undefined version as 0 and run migration
      expect(mockSetPreferences).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty widgets array', () => {
      const preferencesWithEmptyWidgets = {
        widgets: [],
        migrationVersion: 2,
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithEmptyWidgets,
        mockSetPreferences,
      ]);

      const { result } = renderHook(() => useDashboardSettings());

      expect(result.current.getEnabledWidgets()).toEqual([]);
      expect(result.current.isWidgetEnabled('total-time-today')).toBe(false);
    });

    it('should handle widgets without order property', () => {
      const preferencesWithoutOrder = {
        widgets: [
          { id: 'total-time-today', enabled: true },
          { id: 'earnings-today', enabled: true, order: 2 },
        ],
        migrationVersion: 2,
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithoutOrder,
        mockSetPreferences,
      ]);

      const { result } = renderHook(() => useDashboardSettings());
      const enabledWidgets = result.current.getEnabledWidgets();

      // Should handle missing order gracefully (defaults to 0)
      expect(enabledWidgets).toHaveLength(2);
      expect(enabledWidgets[0].id).toBe('total-time-today'); // order 0 comes first
      expect(enabledWidgets[1].id).toBe('earnings-today'); // order 2 comes second
    });

    it('should handle multiple rapid toggles', () => {
      const { result } = renderHook(() => useDashboardSettings());

      act(() => {
        result.current.toggleWidget('total-time-today');
        result.current.toggleWidget('earnings-today');
        result.current.toggleWidget('total-time-today');
      });

      expect(mockSetPreferences).toHaveBeenCalledTimes(3);
    });

    it('should preserve other widget properties when toggling', () => {
      const preferencesWithExtraProps = {
        widgets: [
          { id: 'total-time-today', enabled: true, order: 1, customProp: 'value' },
        ],
        migrationVersion: 2,
      };

      mockUseLocalStorage.mockReturnValue([
        preferencesWithExtraProps,
        mockSetPreferences,
      ]);

      const { result } = renderHook(() => useDashboardSettings());

      act(() => {
        result.current.toggleWidget('total-time-today');
      });

      const updateFunction = mockSetPreferences.mock.calls[0][0];
      const newPreferences = updateFunction(preferencesWithExtraProps);

      const updatedWidget = newPreferences.widgets.find((w: any) => w.id === 'total-time-today');
      expect(updatedWidget).toEqual({
        id: 'total-time-today',
        enabled: false,
        order: 1,
        customProp: 'value',
      });
    });
  });
});
