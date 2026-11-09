/**
 * Small pieces for fitting a desktop row onto a phone, without changing how
 * it looks on a desktop.
 */

import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { PHONE } from '../../theme/media';

/**
 * Spread into a one-line (noWrap) text's phone styles: there it wraps to a
 * second line, then ends in an ellipsis, instead of cutting off on the first.
 */
export const TWO_LINES = {
  whiteSpace: 'normal',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
} as const;

/**
 * Spread into a row Stack's phone styles: its items wrap, spaced by a gap
 * (the Stack's own spacing is a left margin, which a wrapped line would
 * start with).
 */
export const STACK_WRAP = { flexWrap: 'wrap', gap: 1, '& > :not(style) ~ :not(style)': { ml: 0 } } as const;

/** Spread into a row Stack's phone styles: its items go one under another, 16px apart. */
export const STACK_COLUMN = { flexDirection: 'column', gap: 2, '& > :not(style) ~ :not(style)': { ml: 0 } } as const;

interface PhoneOwnLineProps {
  children: ReactNode;
  /** The line's own styles on a phone (it's a flex row there). */
  sx?: Record<string, string | number>;
}

/**
 * Inside a flex row: on a desktop its children are items of that row as if
 * this box weren't there; on a phone they move to a line of their own
 * (the row must wrap there).
 */
export function PhoneOwnLine({ children, sx }: PhoneOwnLineProps) {
  return (
    <Box
      sx={{
        display: 'contents',
        [PHONE]: { display: 'flex', flexBasis: '100%', alignItems: 'center', gap: 1, ...sx },
      }}
    >
      {children}
    </Box>
  );
}
