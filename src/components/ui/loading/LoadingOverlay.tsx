/**
 * Loading Overlay Component
 * 
 * This component provides loading states and overlays for better user feedback
 * during async operations with customizable appearance and behavior.
 */

import { ReactNode } from 'react';
import { Box, CircularProgress, Typography, Backdrop, Fade } from '@mui/material';
import { ProgressWithLabel } from './ProgressWithLabel';

// Loading overlay props
export interface LoadingOverlayProps {
  isLoading: boolean;
  children: ReactNode;
  message?: string;
  variant?: 'overlay' | 'inline' | 'backdrop';
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'secondary' | 'inherit';
  disableInteraction?: boolean;
  showProgress?: boolean;
  progress?: number;
  minHeight?: number | string;
}

/**
 * Loading Overlay Component
 */
export function LoadingOverlay({
  isLoading,
  children,
  message = 'Loading...',
  variant = 'overlay',
  size = 'medium',
  color = 'primary',
  disableInteraction = true,
  showProgress = false,
  progress,
  minHeight = 200,
}: LoadingOverlayProps) {
  const getSpinnerSize = () => {
    switch (size) {
      case 'small':
        return 24;
      case 'large':
        return 60;
      case 'medium':
      default:
        return 40;
    }
  };

  const getMessageSize = () => {
    switch (size) {
      case 'small':
        return 'body2';
      case 'large':
        return 'h6';
      case 'medium':
      default:
        return 'body1';
    }
  };

  // Backdrop variant
  if (variant === 'backdrop') {
    return (
      <>
        {children}
        <Backdrop
          open={isLoading}
          sx={{
            color: '#fff',
            zIndex: (theme) => theme.zIndex.drawer + 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
          }}
        >
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={2}
          >
            {showProgress && progress !== undefined ? (
              <ProgressWithLabel progress={progress} color={color} width={200} />
            ) : (
              <CircularProgress size={getSpinnerSize()} color={color} />
            )}
            <Typography variant={getMessageSize() as any} textAlign="center">
              {message}
            </Typography>
          </Box>
        </Backdrop>
      </>
    );
  }

  // Inline variant
  if (variant === 'inline') {
    if (!isLoading) {
      return <>{children}</>;
    }

    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight={minHeight}
        gap={2}
        p={3}
      >
        {showProgress && progress !== undefined ? (
          <ProgressWithLabel
            progress={progress}
            color={color}
            width="100%"
            maxWidth={300}
          />
        ) : (
          <CircularProgress size={getSpinnerSize()} color={color} />
        )}
        <Typography variant={getMessageSize() as any} textAlign="center" color="text.secondary">
          {message}
        </Typography>
      </Box>
    );
  }

  // Overlay variant (default)
  return (
    <Box position="relative" minHeight={minHeight}>
      {children}
      <Fade in={isLoading}>
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          bgcolor="rgba(255, 255, 255, 0.8)"
          zIndex={1000}
          gap={2}
          sx={{
            backdropFilter: 'blur(2px)',
            pointerEvents: disableInteraction ? 'all' : 'none',
          }}
        >
          {showProgress && progress !== undefined ? (
            <ProgressWithLabel
              progress={progress}
              color={color}
              width="80%"
              maxWidth={300}
            />
          ) : (
            <CircularProgress size={getSpinnerSize()} color={color} />
          )}
          <Typography variant={getMessageSize() as any} textAlign="center" color="text.primary">
            {message}
          </Typography>
        </Box>
      </Fade>
    </Box>
  );
}

/**
 * Loading Dots Component
 */
export function LoadingDots({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
  const dotSize = size === 'small' ? 4 : size === 'large' ? 8 : 6;
  
  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      {[0, 1, 2].map((index) => (
        <Box
          key={index}
          sx={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: 'currentColor',
            animation: 'loadingDots 1.4s infinite ease-in-out',
            animationDelay: `${index * 0.16}s`,
            '@keyframes loadingDots': {
              '0%, 80%, 100%': {
                transform: 'scale(0)',
                opacity: 0.5,
              },
              '40%': {
                transform: 'scale(1)',
                opacity: 1,
              },
            },
          }}
        />
      ))}
    </Box>
  );
}

export default LoadingOverlay;
