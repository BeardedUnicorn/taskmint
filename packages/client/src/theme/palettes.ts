/**
 * The light and dark palettes. Shared brand colors; each mode's text colors
 * read on its surfaces, and the text on a filled chip or button reads on its
 * fill (4.5:1, checked by palettes.test).
 */

import type { PaletteOptions } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

/** The brand green. Text in it on a light surface uses BRAND_TEXT_LIGHT. */
export const BRAND = '#65D6A1';
/** Brand-green text that reads on a light surface. */
export const BRAND_TEXT_LIGHT = '#1F6F4A';

/** Brand-green text (a figure, a selected tab's label) that reads on the mode's surfaces. */
export const brandText = (mode: ColorMode) => (mode === 'light' ? BRAND_TEXT_LIGHT : BRAND);

const brand = {
  // `dark` is a pressed or hovered brand fill: the same mint, a step deeper
  primary: { main: BRAND, dark: '#4FC38C', light: '#B2DFDB' },
  secondary: { main: '#0D7377', dark: '#004D40', light: '#4DB6AC' },
};

export const palettes: Record<ColorMode, PaletteOptions> = {
  light: {
    mode: 'light',
    ...brand,
    background: { default: '#FAFAFA', paper: '#ffffff' },
    text: { primary: '#3F4E4F', secondary: '#616161' },
    error: { main: '#D32F2F', contrastText: '#ffffff' },
    warning: { main: '#A15C00', dark: '#8A5300', contrastText: '#ffffff' },
    info: { main: '#0277BD', contrastText: '#ffffff' },
    success: { main: BRAND_TEXT_LIGHT, contrastText: '#ffffff' },
    divider: 'rgba(0, 0, 0, 0.12)',
  },
  dark: {
    mode: 'dark',
    ...brand,
    // The brand teal is too dark to read on a dark surface: its light shade stands in
    secondary: { main: '#4DB6AC', dark: '#0D7377', light: '#80CBC4', contrastText: '#000000' },
    background: { default: '#121212', paper: '#1e1e1e' },
    text: { primary: '#FAFAFA', secondary: '#b0b0b0' },
    // These are bright: dark text reads on them, white doesn't
    error: { main: '#FF5C5C', contrastText: '#000000' },
    warning: { main: '#FFC83D', contrastText: '#000000' },
    info: { main: '#2196f3', contrastText: '#000000' },
    // One green: money earned and things going well are the brand's mint
    success: { main: BRAND, contrastText: '#000000' },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
};
