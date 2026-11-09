import { Box, Divider, Typography } from '@mui/material';
import { Palette as AppearanceIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { ThemeSelector } from './ThemeSelector';
import { KeyboardShortcutsList } from './KeyboardShortcutsList';
import { TOUCH } from '../../../theme/media';

export function AppearanceSettingsSection() {
  return (
    <SettingsSection title="Appearance" icon={<AppearanceIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        System follows your operating system's light or dark setting.
      </Typography>
      <ThemeSelector />

      {/* No keyboard to speak of on a touch screen */}
      <Box sx={{ [TOUCH]: { display: 'none' } }}>
        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
          Keyboard shortcuts
        </Typography>
        <KeyboardShortcutsList />
      </Box>
    </SettingsSection>
  );
}
