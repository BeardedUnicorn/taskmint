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

// Default dashboard widgets configuration. Only widgets the Sessions page
// actually renders belong here — the old todays-entries and
// daily-goal-progress entries never had a renderer, so their toggles lied.
const DEFAULT_WIDGETS: DashboardWidget[] = [
  // Ids predate the switch to all-time totals; they are stored in users'
  // saved preferences, so they keep their historical "-today" names.
  {
    id: 'total-time-today',
    title: 'Total Time',
    description: 'Shows the total time tracked across all sessions',
    defaultEnabled: true,
    defaultOrder: 1,
  },
  {
    id: 'earnings-today',
    title: 'Earnings',
    description: 'Shows total earnings based on hourly rates',
    defaultEnabled: true,
    defaultOrder: 2,
  },
];

// Current migration version - increment when adding new widgets or changing structure
const CURRENT_MIGRATION_VERSION = 2;

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

    // v1 added missing defaults; v2 prunes stored ids that no longer exist
    // (todays-entries / daily-goal-progress never had renderers). Both steps
    // are idempotent, so reconcile stored widgets against the defaults in one
    // pass regardless of the starting version.
    setPreferences(prev => {
      // Set<string>: stored configs may carry legacy ids outside the union.
      const knownIds = new Set<string>(DEFAULT_WIDGETS.map(w => w.id));
      const kept = prev.widgets.filter(w => knownIds.has(w.id));
      const existingIds = new Set(kept.map(w => w.id));
      const added = DEFAULT_WIDGETS
        .filter(widget => !existingIds.has(widget.id))
        .map(widget => ({
          id: widget.id,
          enabled: widget.defaultEnabled,
          order: widget.defaultOrder,
        }));

      return {
        ...prev,
        widgets: [...kept, ...added],
        migrationVersion: CURRENT_MIGRATION_VERSION,
      };
    });
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
