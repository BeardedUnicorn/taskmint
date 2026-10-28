import { Typography } from '@mui/material';
import { EarningsDisplayProps } from '../../../types/ui';
import { formatCurrency } from '../../../utils/formatters';

/** An amount earned: highlighted when there is one, muted at $0.00. */
export function EarningsDisplay({ amount, variant = 'body2' }: EarningsDisplayProps) {
  const earned = amount > 0;
  return (
    <Typography
      variant={variant}
      component="span"
      sx={{
        color: earned ? 'success.main' : 'text.secondary',
        fontWeight: earned ? 600 : 400,
        fontFamily: '"Roboto Mono", monospace',
      }}
    >
      {formatCurrency(amount)}
    </Typography>
  );
}
