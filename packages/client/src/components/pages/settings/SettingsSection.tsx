import { Box, Paper, PaperProps, Typography } from '@mui/material';
import { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  headerChildren?: ReactNode;
  paperProps?: PaperProps;
}

export function SettingsSection({
  title,
  icon,
  children,
  headerChildren,
  paperProps,
}: SettingsSectionProps) {
  return (
    <Paper {...paperProps} sx={{ p: 3, mb: 4, ...(paperProps?.sx || {}) }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {icon}
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {headerChildren}
      </Box>
      {children}
    </Paper>
  );
}
