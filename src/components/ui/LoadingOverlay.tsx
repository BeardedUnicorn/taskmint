/**
 * Loading Overlay Component
 * 
 * This component provides loading states and overlays for better user feedback
 * during async operations with customizable appearance and behavior.
 */

import { ReactNode } from 'react';
import {
  Box,
  CircularProgress,
  LinearProgress,
  Typography,
  Backdrop,
  Fade,
  Skeleton,
} from '@mui/material';

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
              <Box sx={{ width: 200 }}>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  color={color}
                  sx={{ height: 8, borderRadius: 4 }}
                />
                <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
                  {Math.round(progress)}%
                </Typography>
              </Box>
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
          <Box sx={{ width: '100%', maxWidth: 300 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              color={color}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
              {Math.round(progress)}%
            </Typography>
          </Box>
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
            <Box sx={{ width: '80%', maxWidth: 300 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                color={color}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
                {Math.round(progress)}%
              </Typography>
            </Box>
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
 * Loading Button Component
 */
export interface LoadingButtonProps {
  loading: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary' | 'inherit';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loadingText?: string;
  className?: string;
}

export function LoadingButton({
  loading,
  children,
  onClick,
  disabled = false,
  variant = 'contained',
  color = 'primary',
  size = 'medium',
  fullWidth = false,
  startIcon,
  endIcon,
  loadingText,
  className,
}: LoadingButtonProps) {
  const getSpinnerSize = () => {
    switch (size) {
      case 'small':
        return 16;
      case 'large':
        return 24;
      case 'medium':
      default:
        return 20;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: size === 'small' ? '6px 12px' : size === 'large' ? '12px 24px' : '8px 16px',
        fontSize: size === 'small' ? '0.75rem' : size === 'large' ? '1rem' : '0.875rem',
        fontWeight: 500,
        borderRadius: '8px',
        border: variant === 'outlined' ? '1px solid currentColor' : 'none',
        backgroundColor: variant === 'contained' ? (color === 'primary' ? '#1976d2' : '#9c27b0') : 'transparent',
        color: variant === 'contained' ? '#ffffff' : (color === 'primary' ? '#1976d2' : '#9c27b0'),
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'all 0.2s',
        width: fullWidth ? '100%' : 'auto',
      }}
    >
      {loading && (
        <CircularProgress
          size={getSpinnerSize()}
          color="inherit"
          sx={{ position: 'absolute' }}
        />
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          opacity: loading ? 0 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {startIcon}
        {loading && loadingText ? loadingText : children}
        {endIcon}
      </Box>
    </button>
  );
}

/**
 * Skeleton Loader Component
 */
export interface SkeletonLoaderProps {
  loading: boolean;
  children: ReactNode;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: number | string;
  height?: number | string;
  count?: number;
  animation?: 'pulse' | 'wave' | false;
}

export function SkeletonLoader({
  loading,
  children,
  variant = 'rectangular',
  width = '100%',
  height = 40,
  count = 1,
  animation = 'wave',
}: SkeletonLoaderProps) {
  if (!loading) {
    return <>{children}</>;
  }

  return (
    <Box>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          variant={variant}
          width={width}
          height={height}
          animation={animation}
          sx={{ mb: count > 1 ? 1 : 0 }}
        />
      ))}
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
