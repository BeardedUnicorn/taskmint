import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import { Dashboard as DashboardIcon } from '@mui/icons-material';
import { useDashboardSettings } from '../../../hooks/useDashboardSettings';
import { DashboardWidgetId } from '../../../types/ui';

interface DashboardCustomizationSectionProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function DashboardCustomizationSection({ onSuccess, onError }: DashboardCustomizationSectionProps) {
  const {
    getAvailableWidgets,
    isWidgetEnabled,
    toggleWidget,
    resetToDefaults
  } = useDashboardSettings();

  const availableWidgets = getAvailableWidgets();

  const handleToggleWidget = async (widgetId: DashboardWidgetId) => {
    try {
      toggleWidget(widgetId);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to toggle widget:', error);
      const errorMessage = 'Failed to update widget settings. Please try again.';
      onError?.(errorMessage);
    }
  };

  const handleResetToDefaults = async () => {
    try {
      resetToDefaults();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to reset to defaults:', error);
      const errorMessage = 'Failed to reset widget settings. Please try again.';
      onError?.(errorMessage);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <DashboardIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Dashboard Customization
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Customize which widgets are displayed on your dashboard and their visibility.
      </Typography>

      <List>
        {availableWidgets.map((widget) => (
          <ListItem key={widget.id} divider>
            <ListItemText
              primary={widget.title}
              secondary={widget.description}
            />
            <ListItemSecondaryAction>
              <FormControlLabel
                control={
                  <Switch
                    checked={isWidgetEnabled(widget.id)}
                    onChange={() => handleToggleWidget(widget.id)}
                    color="primary"
                  />
                }
                label={isWidgetEnabled(widget.id) ? 'Visible' : 'Hidden'}
                labelPlacement="start"
              />
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          onClick={handleResetToDefaults}
          size="small"
        >
          Reset to Defaults
        </Button>
      </Box>

      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Widget Visibility:</strong> Toggle widgets on/off to customize your dashboard view.
          Changes are saved automatically and will be applied immediately.
          <br />
          <strong>New:</strong> The "Daily Goal Progress" widget shows your progress towards daily earnings goals.
          Set up a goal above to start tracking your progress!
        </Typography>
      </Alert>
    </Paper>
  );
}
