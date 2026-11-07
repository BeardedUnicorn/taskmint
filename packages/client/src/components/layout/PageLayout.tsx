/**
 * The frame every page shares: a centered column (PageContainer) under a
 * header with the page's title, a line about it, and its main actions
 * (PageHeader).
 */

import { ReactNode } from 'react';
import { Box, Skeleton, Stack, Typography } from '@mui/material';

/** Widest a page's content gets. */
export const PAGE_MAX_WIDTH = 1200;

interface PageContainerProps {
  children: ReactNode;
  /**
   * The page fills the window's height and scrolls inside its own panes
   * (Tasks, Notes), instead of scrolling as a whole.
   */
  fill?: boolean;
}

export function PageContainer({ children, fill = false }: PageContainerProps) {
  return (
    <Box
      sx={{
        p: 3,
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        mx: 'auto',
        ...(fill && { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }),
      }}
    >
      {children}
    </Box>
  );
}

interface PageHeaderProps {
  title: string;
  /** Beside the title, outside the heading (a count chip). */
  titleAdornment?: ReactNode;
  subtitle?: ReactNode;
  /** The page's main buttons, on the right. */
  actions?: ReactNode;
  /** Below the title: tabs, a status line. */
  children?: ReactNode;
}

export function PageHeader({ title, titleAdornment, subtitle, actions, children }: PageHeaderProps) {
  return (
    <Box component="header" sx={{ mb: 3, flexShrink: 0 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {titleAdornment}
          </Box>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
      {children}
    </Box>
  );
}

/** A page's shape while its code loads. */
export function PageSkeleton() {
  return (
    <PageContainer>
      <Box aria-busy="true" aria-label="Loading">
        <Skeleton variant="text" width={220} height={48} />
        <Skeleton variant="text" width={360} sx={{ mb: 3 }} />
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={96} />
          <Skeleton variant="rounded" height={240} />
        </Stack>
      </Box>
    </PageContainer>
  );
}
