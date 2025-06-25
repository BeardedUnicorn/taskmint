/**
 * Dashboard Settings Hook
 * 
 * Manages dashboard widget preferences including visibility and ordering.
 * Provides functionality to customize which widgets are shown and in what order.
 */

import { useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { 
  DashboardWidgetPreferences, 
  DashboardWidget, 
  DashboardWidgetId,
  DashboardWidgetConfig 
} from '../types/ui';

// Default dashboard widgets configuration
const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: 'total-time-today',
    title: 'Total Time Today',
    description: 'Shows the total time tracked for the current day',
    defaultEnabled: true,
    defaultOrder: 1,
  },
  {
    id: 'earnings-today',
    title: 'Earnings Today',
    description: 'Shows total earnings based on hourly rates for today',
    defaultEnabled: true,
    defaultOrder: 2,
  },
  {
    id: 'tasks-worked-on',
    title: 'Tasks Worked On',
    description: 'Shows the number of unique tasks worked on today',
    defaultEnabled: true,
    defaultOrder: 3,
  },
  {
    id: 'todays-entries',
    title: "Today's Time Entries",
    description: 'Shows a detailed list of all time entries for today',
    defaultEnabled: true,
    defaultOrder: 5,
  },
  {
    id: 'daily-goal-progress',
    title: 'Daily Goal Progress',
    description: 'Shows progress towards your daily earnings goal with notifications',
    defaultEnabled: true,
    defaultOrder: 4,
  },
];

// Current migration version - increment when adding new widgets or changing structure
const CURRENT_MIGRATION_VERSION = 1;

// Default preferences
const DEFAULT_PREFERENCES: DashboardWidgetPreferences = {
  widgets: DEFAULT_WIDGETS.map(widget => ({
    id: widget.id,
    enabled: widget.defaultEnabled,
    order: widget.defaultOrder,
  })),
  migrationVersion: CURRENT_MIGRATION_VERSION,
};

export function useDashboardSettings() {
  const [preferences, setPreferences] = useLocalStorage<DashboardWidgetPreferences>(
    'dashboardWidgetPrefs',
    DEFAULT_PREFERENCES
  );

  // Version-based migration: Add new widgets to existing preferences
  useEffect(() => {
    const currentVersion = preferences.migrationVersion || 0;

    // Only run migration if we're behind the current version
    if (currentVersion >= CURRENT_MIGRATION_VERSION) {
      return;
    }

    console.log(`Running dashboard widget migration from version ${currentVersion} to ${CURRENT_MIGRATION_VERSION}`);

    // Migration logic for version 1: Add any missing widgets
    if (currentVersion < 1) {
      const existingWidgetIds = new Set(preferences.widgets.map(w => w.id));
      const newWidgets = DEFAULT_WIDGETS.filter(widget => !existingWidgetIds.has(widget.id));

      if (newWidgets.length > 0) {
        console.log('Adding new dashboard widgets:', newWidgets.map(w => w.id));
        const newWidgetConfigs = newWidgets.map(widget => ({
          id: widget.id,
          enabled: widget.defaultEnabled,
          order: widget.defaultOrder,
        }));

        setPreferences(prev => ({
          ...prev,
          widgets: [...prev.widgets, ...newWidgetConfigs],
          migrationVersion: CURRENT_MIGRATION_VERSION,
        }));
        return; // Exit early since setPreferences will trigger a re-render
      }
    }

    // If no widgets were added but version is still behind, just update the version
    if (currentVersion < CURRENT_MIGRATION_VERSION) {
      setPreferences(prev => ({
        ...prev,
        migrationVersion: CURRENT_MIGRATION_VERSION,
      }));
    }
  }, [preferences, setPreferences]);

  // Get all available widgets
  const getAvailableWidgets = useCallback((): DashboardWidget[] => {
    return DEFAULT_WIDGETS;
  }, []);

  // Get enabled widgets sorted by order
  const getEnabledWidgets = useCallback((): DashboardWidgetConfig[] => {
    return preferences.widgets
      .filter(widget => widget.enabled)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [preferences.widgets]);

  // Check if a specific widget is enabled
  const isWidgetEnabled = useCallback((widgetId: DashboardWidgetId): boolean => {
    const widget = preferences.widgets.find(w => w.id === widgetId);
    return widget?.enabled ?? false;
  }, [preferences.widgets]);

  // Toggle widget visibility
  const toggleWidget = useCallback((widgetId: DashboardWidgetId) => {
    setPreferences(prev => ({
      ...prev,
      widgets: prev.widgets.map(widget =>
        widget.id === widgetId
          ? { ...widget, enabled: !widget.enabled }
          : widget
      ),
    }));
  }, [setPreferences]);

  // Update widget order
  const updateWidgetOrder = useCallback((widgetId: DashboardWidgetId, newOrder: number) => {
    setPreferences(prev => ({
      ...prev,
      widgets: prev.widgets.map(widget =>
        widget.id === widgetId
          ? { ...widget, order: newOrder }
          : widget
      ),
    }));
  }, [setPreferences]);

  // Reset to default preferences
  const resetToDefaults = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, [setPreferences]);

  // Bulk update widget preferences
  const updateWidgetPreferences = useCallback((newWidgets: DashboardWidgetConfig[]) => {
    setPreferences(prev => ({
      ...prev,
      widgets: newWidgets,
    }));
  }, [setPreferences]);

  // Get widget configuration by ID
  const getWidgetConfig = useCallback((widgetId: DashboardWidgetId): DashboardWidgetConfig | undefined => {
    return preferences.widgets.find(w => w.id === widgetId);
  }, [preferences.widgets]);

  // Get widget metadata by ID
  const getWidgetMetadata = useCallback((widgetId: DashboardWidgetId): DashboardWidget | undefined => {
    return DEFAULT_WIDGETS.find(w => w.id === widgetId);
  }, []);

  return {
    // State
    preferences,
    
    // Widget queries
    getAvailableWidgets,
    getEnabledWidgets,
    isWidgetEnabled,
    getWidgetConfig,
    getWidgetMetadata,
    
    // Widget management
    toggleWidget,
    updateWidgetOrder,
    updateWidgetPreferences,
    resetToDefaults,
  };
}
