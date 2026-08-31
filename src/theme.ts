import { createTheme } from '@mui/material/styles';

// Re-export light theme
export { createLightTheme } from './theme/lightTheme';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#65D6A1',
      dark: '#4CAF50',
      light: '#B2DFDB',
    },
    secondary: {
      main: '#0D7377',
      dark: '#004D40',
      light: '#4DB6AC',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#FAFAFA',
      secondary: '#b0b0b0',
    },
    // Enhanced contrast for accessibility
    error: {
      main: '#FF5C5C',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#FFD700',
      contrastText: '#000000',
    },
    info: {
      main: '#2196f3',
      contrastText: '#ffffff',
    },
    success: {
      main: '#32CD32',
      contrastText: '#ffffff',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    // Improved font sizes for accessibility
    fontSize: 14,
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1.125rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e1e1e',
          borderRadius: 12, // Specific value for cards
          // Enhanced focus outline for accessibility
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '2px',
          },
        },
      },
    },
    MuiButton: {
      // No aria-label default: it OVERRIDES the visible text as the
      // accessible name, so every unlabeled button was announced as "Button".
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          borderRadius: theme.shape.borderRadius,
          minHeight: 44, // Minimum touch target size
          padding: '8px 16px',
          // Enhanced focus styles
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '2px',
          },
          // Better hover contrast
          '&:hover': {
            backgroundColor: 'rgba(101, 214, 161, 0.08)',
          },
        }),
        contained: {
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          },
        },
      },
    },
    MuiIconButton: {
      // No aria-label default: a generic "Icon button" name suppresses the
      // Tooltip-derived name and hides which control this actually is.
      styleOverrides: {
        root: {
          minWidth: 44, // Minimum touch target size
          minHeight: 44,
          // Enhanced focus styles
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '2px',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          // Enhanced focus styles for form inputs
          '& .MuiOutlinedInput-root': {
            '&:focus-within': {
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#65D6A1',
                borderWidth: '2px',
              },
            },
            // Enhanced multiline text field styling
            '&.MuiInputBase-multiline': {
              padding: '12px 14px',
              alignItems: 'flex-start',
              '& .MuiInputBase-input': {
                resize: 'vertical',
                minHeight: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                lineHeight: 1.5,
              },
            },
          },
          // Better label positioning for multiline fields
          '& .MuiInputLabel-root': {
            '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
              transform: 'translate(14px, -9px) scale(0.75)',
            },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 48, // Minimum touch target size
          // Enhanced focus styles
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '2px',
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 44, // Minimum touch target size
          // Enhanced focus styles
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '-2px',
          },
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          minHeight: 44, // Minimum touch target size
          // Enhanced focus styles
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '-2px',
          },
        },
      },
    },
    // Enhanced table accessibility
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          // Better contrast for table cells
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '-2px',
          },
        },
        head: {
          fontWeight: 600,
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
      },
    },
    // Enhanced dialog accessibility
    MuiDialog: {
      styleOverrides: {
        paper: {
          // Ensure dialogs have proper focus management
          '&:focus-visible': {
            outline: '2px solid #65D6A1',
            outlineOffset: '2px',
          },
        },
      },
    },
    // Enhanced tooltip accessibility
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.875rem',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          color: '#ffffff',
          maxWidth: 300,
        },
      },
    },
    // Paper component for consistent elevation
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Remove default gradient
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.4)',
        },
        elevation2: {
          boxShadow: '0 3px 6px rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.5)',
        },
        elevation3: {
          boxShadow: '0 10px 20px rgba(0, 0, 0, 0.5), 0 6px 6px rgba(0, 0, 0, 0.6)',
        },
      },
    },
  },
});
