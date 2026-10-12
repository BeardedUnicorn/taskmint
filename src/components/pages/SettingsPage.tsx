import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Description as TemplateIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { NoteTemplates } from './NoteTemplates';
import { useTimerSettings } from '../../hooks/useTimerSettings';
import { useFundsReleaseSettings } from '../../hooks/useFundsReleaseSettings';
import { TimerRoundingOption } from '../../types/timer';
import { getRoundingOptionLabel } from '../../utils/formatters';
import {
  DailyGoalSettings,
  BackupSettingsSection,
  DashboardCustomizationSection,
  DataManagementSection,
  PrivacySettingsSection,
} from './settings';
import { InactivitySettingsSection } from './settings/InactivitySettingsSection';

export function SettingsPage() {
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const { roundingOption, updateRoundingOption } = useTimerSettings();
  const { days, updateDays } = useFundsReleaseSettings();

  const roundingOptions: TimerRoundingOption[] = ['none', 'up-5min', 'up-15min', 'up-30min'];

  // Shared success/error handlers for sub-components
  const handleSuccess = () => {
    setExportSuccess(true);
    setExportError(null);
    setImportError(null);
  };

  const handleError = (error: string) => {
    setExportError(error);
    setExportSuccess(false);
  };

  const handleImportSuccess = () => {
    setImportSuccess(true);
    setImportError(null);
    setExportError(null);
  };

  const handleImportError = (error: string) => {
    setImportError(error);
    setImportSuccess(false);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
        Settings
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage your application settings, note templates, and data
      </Typography>

      {/* Timer Settings Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TimerIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Timer Settings
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure how timer durations are calculated and displayed.
        </Typography>

        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel id="rounding-option-label">Duration Rounding</InputLabel>
          <Select
            labelId="rounding-option-label"
            value={roundingOption}
            label="Duration Rounding"
            onChange={(e) => updateRoundingOption(e.target.value as TimerRoundingOption)}
          >
            {roundingOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {getRoundingOptionLabel(option)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Duration Rounding:</strong> Choose how timer durations are rounded when stopping a timer.
            This affects the final duration saved for time entries and earnings calculations.
          </Typography>
        </Alert>

        <FormControl sx={{ minWidth: 250, mt: 3 }}>
          <InputLabel id="funds-release-label">Days Before Funds Released</InputLabel>
          <Select
            labelId="funds-release-label"
            value={days}
            label="Days Before Funds Released"
            onChange={(e) => updateDays(Number(e.target.value))}
          >
            {[...Array(31).keys()].map((day) => (
              <MenuItem key={day} value={day}>
                {day}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Days Before Funds Released:</strong> Set the number of days before earned funds become transferable.
          </Typography>
        </Alert>
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Inactivity Detection Settings Section */}
      <InactivitySettingsSection onSuccess={handleSuccess} onError={handleError} />

      <Divider sx={{ my: 4 }} />

      {/* Daily Earnings Goal Section */}
      <DailyGoalSettings onSuccess={handleSuccess} onError={handleError} />

      <Divider sx={{ my: 4 }} />

      {/* Dashboard Customization Section */}
      <DashboardCustomizationSection onSuccess={handleSuccess} onError={handleError} />

      <Divider sx={{ my: 4 }} />

      {/* Automatic Backup Settings Section */}
      <BackupSettingsSection onSuccess={handleSuccess} onError={handleError} />

      <Divider sx={{ my: 4 }} />

      {/* Data Management Section */}
      <DataManagementSection
        onSuccess={handleSuccess}
        onError={handleError}
        onImportSuccess={handleImportSuccess}
        onImportError={handleImportError}
      />

      <Divider sx={{ my: 4 }} />

      {/* Privacy Section */}
      <PrivacySettingsSection />

      <Divider sx={{ my: 4 }} />

      {/* Note Templates Section */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TemplateIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Note Templates
          </Typography>
        </Box>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Create and manage note templates for consistent documentation across your tasks.
        </Typography>

        {/* Embed the NoteTemplates component */}
        <Box sx={{ 
          border: '1px solid', 
          borderColor: 'divider', 
          borderRadius: 1,
          overflow: 'hidden'
        }}>
          <NoteTemplates />
        </Box>
      </Paper>

      {/* Success/Error Snackbars */}
      <Snackbar
        open={exportSuccess}
        autoHideDuration={4000}
        onClose={() => setExportSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setExportSuccess(false)} 
          severity="success" 
          sx={{ width: '100%' }}
        >
          Data operation completed successfully!
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!exportError}
        autoHideDuration={6000}
        onClose={() => setExportError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setExportError(null)}
          severity="error"
          sx={{ width: '100%' }}
        >
          {exportError}
        </Alert>
      </Snackbar>

      {/* Import Success Notification */}
      <Snackbar
        open={importSuccess}
        autoHideDuration={6000}
        onClose={() => setImportSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setImportSuccess(false)}
          severity="success"
          sx={{ width: '100%' }}
        >
          Data imported successfully!
        </Alert>
      </Snackbar>

      {/* Import Error Notification */}
      <Snackbar
        open={!!importError}
        autoHideDuration={6000}
        onClose={() => setImportError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setImportError(null)}
          severity="error"
          sx={{ width: '100%' }}
        >
          {importError}
        </Alert>
      </Snackbar>


    </Box>
  );
}
