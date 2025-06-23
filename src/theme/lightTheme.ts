/**
 * Light Theme Configuration
 * 
 * This file contains the light theme configuration for the application
 * with accessibility enhancements and consistent styling.
 */

import { createTheme } from '@mui/material/styles';

export function createLightTheme() {
  return createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: '#1976d2',
        dark: '#115293',
        light: '#42a5f5',
      },
      secondary: {
        main: '#9c27b0',
        dark: '#6a1b9a',
        light: '#ba68c8',
      },
      background: {
        default: '#fafafa',
        paper: '#ffffff',
      },
      text: {
        primary: '#212121',
        secondary: '#757575',
      },
      // Enhanced contrast for accessibility
      error: {
        main: '#d32f2f',
        contrastText: '#ffffff',
      },
      warning: {
        main: '#ed6c02',
        contrastText: '#ffffff',
      },
      info: {
        main: '#0288d1',
        contrastText: '#ffffff',
      },
      success: {
        main: '#2e7d32',
        contrastText: '#ffffff',
      },
      divider: 'rgba(0, 0, 0, 0.12)',
    },
    shape: {
      borderRadius: 8,
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      // Improved font sizes for accessibility
      fontSize: 14,
      h1: {
        fontSize: '2.5rem',
        fontWeight: 600,
        lineHeight: 1.2,
        color: '#212121',
      },
      h2: {
        fontSize: '2rem',
        fontWeight: 600,
        lineHeight: 1.3,
        color: '#212121',
      },
      h3: {
        fontSize: '1.75rem',
        fontWeight: 600,
        lineHeight: 1.3,
        color: '#212121',
      },
      h4: {
        fontSize: '1.5rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: '#212121',
      },
      h5: {
        fontSize: '1.25rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: '#212121',
      },
      h6: {
        fontSize: '1.125rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: '#212121',
      },
      body1: {
        fontSize: '1rem',
        lineHeight: 1.5,
        color: '#212121',
      },
      body2: {
        fontSize: '0.875rem',
        lineHeight: 1.5,
        color: '#757575',
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
            backgroundColor: '#ffffff',
            borderRadius: 12, // Specific value for cards
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            // Enhanced focus outline for accessibility
            '&:focus-visible': {
              outline: '2px solid #1976d2',
              outlineOffset: '2px',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: {
          // Default ARIA attributes for better accessibility
          'aria-label': 'Button',
        },
        styleOverrides: {
          root: ({ theme }) => ({
            textTransform: 'none',
            borderRadius: theme.shape.borderRadius,
            minHeight: 44, // Minimum touch target size
            padding: '8px 16px',
            // Enhanced focus styles
            '&:focus-visible': {
              outline: '2px solid #1976d2',
              outlineOffset: '2px',
            },
            // Better hover contrast
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.08)',
            },
          }),
          contained: {
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            '&:hover': {
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
            },
          },
        },
      },
      MuiIconButton: {
        defaultProps: {
          'aria-label': 'Icon button',
        },
        styleOverrides: {
          root: {
            minWidth: 44, // Minimum touch target size
            minHeight: 44,
            // Enhanced focus styles
            '&:focus-visible': {
              outline: '2px solid #1976d2',
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
                  borderColor: '#1976d2',
                  borderWidth: '2px',
                },
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
              outline: '2px solid #1976d2',
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
              outline: '2px solid #1976d2',
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
              outline: '2px solid #1976d2',
              outlineOffset: '-2px',
            },
          },
        },
      },
      // Enhanced table accessibility
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
            // Better contrast for table cells
            '&:focus-visible': {
              outline: '2px solid #1976d2',
              outlineOffset: '-2px',
            },
          },
          head: {
            fontWeight: 600,
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
        },
      },
      // Enhanced dialog accessibility
      MuiDialog: {
        styleOverrides: {
          paper: {
            // Ensure dialogs have proper focus management
            '&:focus-visible': {
              outline: '2px solid #1976d2',
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
            backgroundColor: 'rgba(0, 0, 0, 0.87)',
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
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
          },
          elevation2: {
            boxShadow: '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)',
          },
          elevation3: {
            boxShadow: '0 10px 20px rgba(0, 0, 0, 0.19), 0 6px 6px rgba(0, 0, 0, 0.23)',
          },
        },
      },
      // AppBar styling
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: '#ffffff',
            color: '#212121',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        },
      },
      // Chip styling
      MuiChip: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
            color: '#1976d2',
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.12)',
            },
          },
        },
      },
    },
  });
}
