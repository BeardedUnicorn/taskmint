import { useState } from 'react';
import { FormControlLabel, Switch, Typography } from '@mui/material';
import { PrivacyTip as PrivacyIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { isErrorReportingEnabled, setErrorReportingEnabled } from '../../../utils/sentry';
import { isAnalyticsEnabled, setAnalyticsEnabled } from '../../../utils/analytics';
import { getBackend } from '../../../backend';

export function PrivacySettingsSection() {
  const [enabled, setEnabled] = useState(isErrorReportingEnabled);
  const [analytics, setAnalytics] = useState(isAnalyticsEnabled);
  const hasAnalytics = getBackend().platform.analytics !== undefined;

  const handleToggle = (_: unknown, checked: boolean) => {
    setEnabled(checked);
    void setErrorReportingEnabled(checked);
  };

  return (
    <SettingsSection title="Privacy" icon={<PrivacyIcon color="primary" />}>
      <FormControlLabel
        control={<Switch checked={enabled} onChange={handleToggle} color="primary" />}
        label="Send error reports"
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        When something breaks, TaskMint sends the error and where it happened in the app. Task names, notes, earnings
        and work logs are never included.
      </Typography>
      {hasAnalytics && (
        <>
          <FormControlLabel
            sx={{ mt: 2 }}
            control={
              <Switch
                checked={analytics}
                onChange={(_, checked) => {
                  setAnalytics(checked);
                  setAnalyticsEnabled(checked);
                }}
                color="primary"
              />
            }
            label="Share usage statistics"
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Which pages you open and how often, through Firebase Analytics, so we can see what&apos;s used. Your data
            never goes with it.
          </Typography>
        </>
      )}
    </SettingsSection>
  );
}
