
import { Button, IconButton, Tooltip, CircularProgress } from '@mui/material';
import { ActionButtonProps } from '../../../types/ui';

/**
 * Reusable action button component with consistent styling and behavior
 * Supports both regular buttons and icon-only buttons with tooltips
 */
export function ActionButton({
  onClick,
  icon,
  children,
  variant = 'contained',
  size = 'medium',
  color = 'primary',
  disabled = false,
  loading = false,
  sx,
  tooltip,
}: ActionButtonProps) {
  const buttonContent = (
    <>
      {loading && (
        <CircularProgress
          size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
          sx={{ mr: children ? 1 : 0 }}
        />
      )}
      {/* Only show icon in content if there are no children (icon-only button) */}
      {!loading && icon && !children}
      {children}
    </>
  );

  const buttonProps = {
    onClick,
    disabled: disabled || loading,
    variant,
    size,
    color,
    sx,
    // Only use startIcon when there are children (text + icon button)
    startIcon: !loading && icon && children ? icon : undefined,
  };

  // If only icon and tooltip, render as IconButton
  if (!children && icon && tooltip) {
    const iconButton = (
      <IconButton
        onClick={onClick}
        disabled={disabled || loading}
        size={size}
        color={color}
        sx={sx}
      >
        {loading ? (
          <CircularProgress size={size === 'small' ? 16 : size === 'large' ? 24 : 20} />
        ) : (
          icon
        )}
      </IconButton>
    );

    return <Tooltip title={tooltip}>{iconButton}</Tooltip>;
  }

  // Regular button
  const button = <Button {...buttonProps}>{buttonContent}</Button>;

  // Wrap with tooltip if provided
  if (tooltip) {
    return <Tooltip title={tooltip}>{button}</Tooltip>;
  }

  return button;
}
