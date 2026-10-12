import { Typography } from '@mui/material';
import { Palette as AppearanceIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { ThemeSelector } from '../../../contexts/ThemeContext';

export function AppearanceSettingsSection() {
  return (
    <SettingsSection title="Appearance" icon={<AppearanceIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        System follows your operating system's light or dark setting.
      </Typography>
      <ThemeSelector variant="buttons" />
    </SettingsSection>
  );
}
