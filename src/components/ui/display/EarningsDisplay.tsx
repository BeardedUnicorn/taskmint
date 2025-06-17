import { Typography } from '@mui/material';
import { EarningsDisplayProps } from '../../../types/ui';
import { formatCurrency } from '../../../utils/formatters';

/**
 * Earnings display component with consistent currency formatting
 * Shows monetary amounts with proper styling and color coding
 */
export function EarningsDisplay({
  amount,
  showCurrency = true,
  variant = 'body2',
  color,
  sx,
}: EarningsDisplayProps) {
  const formatAmount = (value: number): string => {
    if (value === 0) return '$0.00';
    
    if (showCurrency) {
      return formatCurrency(value);
    }
    
    return value.toFixed(2);
  };

  const getDisplayColor = (): string => {
    if (color) return color;
    
    if (amount > 0) return 'success.main';
    if (amount === 0) return 'text.secondary';
    return 'error.main';
  };

  return (
    <Typography
      variant={variant}
      component="span"
      sx={{
        color: getDisplayColor(),
        fontWeight: amount > 0 ? 600 : 400,
        fontFamily: 'monospace',
        ...sx,
      }}
    >
      {formatAmount(amount)}
    </Typography>
  );
}
