/** Figures line up in a monospace face. */
export const MONO = { fontFamily: '"Roboto Mono", monospace' } as const;

/** Read by screen readers, not shown (a column header for icon buttons, say). */
export const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
