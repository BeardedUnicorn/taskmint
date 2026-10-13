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
import { AccountBalanceWallet as PayoutsIcon } from '@mui/icons-material';
import { useFundsReleaseSettings } from '../../hooks/useFundsReleaseSettings';
import {
  DailyGoalSettings,
  BackupSettingsSection,
  DataManagementSection,
  PrivacySettingsSection,
  AppearanceSettingsSection,
} from './settings';
import { InactivitySettingsSection } from './settings/InactivitySettingsSection';

export function SettingsPage() {
  // What the last action did, in the words of the section that did it
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const { days, updateDays } = useFundsReleaseSettings();

  const handleSuccess = (text: string) => setNotice({ severity: 'success', text });
  const handleError = (text: string) => setNotice({ severity: 'error', text });
  const handleImportSuccess = () =>
    setNotice({ severity: 'success', text: 'Data imported. Reloading…' });

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
        Settings
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Appearance, payouts, idle detection, your daily goal, backups and data
      </Typography>

      <AppearanceSettingsSection />

      <Divider sx={{ my: 4 }} />

      {/* Payout Settings Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PayoutsIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Payouts
          </Typography>
        </Box>

        <FormControl sx={{ minWidth: 250 }}>
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

      {/* Automatic Backup Settings Section */}
      <BackupSettingsSection onSuccess={handleSuccess} onError={handleError} />

      <Divider sx={{ my: 4 }} />

      {/* Data Management Section */}
      <DataManagementSection
        onSuccess={handleSuccess}
        onError={handleError}
        onImportSuccess={handleImportSuccess}
        onImportError={handleError}
      />

      <Divider sx={{ my: 4 }} />

      {/* Privacy Section */}
      <PrivacySettingsSection />

      <Snackbar
        open={notice !== null}
        autoHideDuration={notice?.severity === 'error' ? 6000 : 4000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setNotice(null)} severity={notice?.severity ?? 'success'} sx={{ width: '100%' }}>
          {notice?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}
