
import { Button } from '@mui/material';
import { ChevronLeft, ChevronRight, Today } from '@mui/icons-material';
import { NavigationButtonProps } from '../../../types/ui';

/**
 * Navigation button component for date/page navigation
 * Provides consistent styling for prev/next/today actions
 */
export function NavigationButton({
  direction,
  onClick,
  label,
  disabled = false,
  size = 'small',
  sx,
}: NavigationButtonProps) {
  const getIcon = () => {
    switch (direction) {
      case 'prev':
        return <ChevronLeft />;
      case 'next':
        return <ChevronRight />;
      case 'today':
        return <Today />;
      default:
        return null;
    }
  };

  const getDefaultLabel = () => {
    switch (direction) {
      case 'prev':
        return 'Previous';
      case 'next':
        return 'Next';
      case 'today':
        return 'Today';
      default:
        return '';
    }
  };

  const displayLabel = label || getDefaultLabel();
  const icon = getIcon();

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size={size}
      variant="outlined"
      startIcon={direction === 'prev' || direction === 'today' ? icon : undefined}
      endIcon={direction === 'next' ? icon : undefined}
      sx={{
        minWidth: direction === 'today' ? 140 : 'auto',
        ...sx,
      }}
    >
      {displayLabel}
    </Button>
  );
}
