import { ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';

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
        color: variant === 'contained' ? '#ffffff' : color === 'primary' ? '#1976d2' : '#9c27b0',
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

export default LoadingButton;
