import useMediaQuery from '@mui/material/useMediaQuery';
import { PHONE } from '../theme/media';

/**
 * True on a phone-sized screen (narrower than 600px), where the app swaps
 * the sidebar for a top bar and shrinks what CSS alone can't (chart sizes).
 * Read on the first render, so the desktop layout never flashes on a phone.
 */
export function useCompactLayout(): boolean {
  return useMediaQuery(PHONE, { noSsr: true });
}

/** NARROW's width: what a list beside its detail, or a wide table, needs. */
const NARROW_BELOW = 1100;

/**
 * True when the window is too narrow for two panes side by side or a wide
 * table (NARROW): every phone, and a desktop or browser window under 1100px.
 * `below` is for a table that needs more.
 */
export function useNarrowLayout(below = NARROW_BELOW): boolean {
  const phone = useCompactLayout();
  const narrow = useMediaQuery(`(max-width:${below - 0.05}px)`, { noSsr: true });
  return phone || narrow;
}
