/**
 * Dashboard Settings Hook
 * 
 * Manages dashboard widget preferences including visibility and ordering.
 * Provides functionality to customize which widgets are shown and in what order.
 */

import { useCallback } from 'react';
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
    defaultOrder: 4,
  },
];

// Default preferences
const DEFAULT_PREFERENCES: DashboardWidgetPreferences = {
  widgets: DEFAULT_WIDGETS.map(widget => ({
    id: widget.id,
    enabled: widget.defaultEnabled,
    order: widget.defaultOrder,
  })),
};

export function useDashboardSettings() {
  const [preferences, setPreferences] = useLocalStorage<DashboardWidgetPreferences>(
    'dashboardWidgetPrefs',
    DEFAULT_PREFERENCES
  );

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
