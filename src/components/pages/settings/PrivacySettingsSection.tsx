import { useState } from 'react';
import { FormControlLabel, Switch, Typography } from '@mui/material';
import { PrivacyTip as PrivacyIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { isErrorReportingEnabled, setErrorReportingEnabled } from '../../../utils/sentry';

export function PrivacySettingsSection() {
  const [enabled, setEnabled] = useState(isErrorReportingEnabled);

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
        When something breaks, TaskMint sends the error and where it happened in the app.
        Task names, notes, earnings and work logs are never included.
      </Typography>
    </SettingsSection>
  );
}
