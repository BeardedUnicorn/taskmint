/**
 * The media queries behind the phone layout. A desktop window is at least
 * 800px wide and driven by a mouse, so it never matches any of these: phone
 * styles go under them, and everything else keeps the desktop look.
 */

/** Narrower than MUI's `sm` breakpoint: a phone held upright. Same as `theme.breakpoints.down('sm')`. */
export const PHONE = '@media (max-width:599.95px)';

/**
 * Too narrow for a list and its detail side by side: a phone, a tablet held
 * upright, or the desktop window near its 800px minimum (the sidebar takes
 * 240 of that). Pages with two panes show one at a time under it.
 */
export const NARROW = '@media (max-width:1099.95px)';

/**
 * A browser window between a phone and the desktop's 800px minimum. The
 * sidebar is kept, but as its strip of icons: at full width it would leave a
 * page less room than a phone gives it.
 */
export const TIGHT = '@media (min-width:600px) and (max-width:799.95px)';

/** The main pointer is a finger, so controls need room to be tapped. */
export const TOUCH = '@media (pointer: coarse)';

/** A pointer that can hover. A tap would leave a hover tint stuck on. */
export const HOVER = '@media (hover: hover)';

/** The phone's bottom bar of tabs (MUI's BottomNavigation height), above the gesture bar's inset. */
export const BOTTOM_BAR_HEIGHT = 56;

/**
 * The room to leave along the bottom for a phone's navigation bar or gesture
 * area, which the app draws under. Android's webview reports none for it in
 * env(safe-area-inset-bottom), so the app also sets --system-bottom-inset
 * from what Android says (useSystemBottomInset).
 */
export const SAFE_BOTTOM = 'max(env(safe-area-inset-bottom, 0px), var(--system-bottom-inset, 0px))';
