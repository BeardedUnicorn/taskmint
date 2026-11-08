import { Box, useTheme } from '@mui/material';

/** The TaskMint wordmark (leaf + name), with light text on a dark theme. */
export function Wordmark({ height }: { height: number }) {
  const dark = useTheme().palette.mode === 'dark';
  return (
    <Box
      component="img"
      src={dark ? '/taskmint-logo-dark.png' : '/taskmint-logo.png'}
      alt="TaskMint"
      sx={{ height, width: 'auto', display: 'block' }}
    />
  );
}
