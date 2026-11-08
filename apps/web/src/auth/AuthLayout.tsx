import type { ReactNode } from 'react';
import { Box, CssBaseline, Paper, Stack, Typography } from '@mui/material';
import { AppThemeProvider, Wordmark } from '@taskmint/client/ui';

/** The pages outside the app: the app's theme, and a card under the logo. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AppThemeProvider>
      <CssBaseline />
      <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
        <Paper sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
          <Stack spacing={1} sx={{ mb: 3, alignItems: 'center', textAlign: 'center' }}>
            <Wordmark height={44} />
            <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
          </Stack>
          {children}
        </Paper>
      </Box>
    </AppThemeProvider>
  );
}
