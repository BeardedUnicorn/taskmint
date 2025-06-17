
import { Card, CardContent, Typography, Box } from '@mui/material';
import { StatsCardProps } from '../../../types/ui';

/**
 * Statistics card component for displaying key metrics
 * Provides consistent styling for dashboard-style statistics
 */
export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  color = 'primary',
  sx,
}: StatsCardProps) {
  const getColorValue = () => {
    switch (color) {
      case 'primary':
        return 'primary.main';
      case 'secondary':
        return 'secondary.main';
      case 'error':
        return 'error.main';
      case 'warning':
        return 'warning.main';
      case 'info':
        return 'info.main';
      case 'success':
        return 'success.main';
      default:
        return 'primary.main';
    }
  };

  const formatValue = (val: string | number): string => {
    if (typeof val === 'number') {
      // Format large numbers with appropriate suffixes
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`;
      }
      if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}K`;
      }
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        ...sx,
      }}
    >
      <CardContent sx={{ flex: 1, p: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{
                color: getColorValue(),
                fontWeight: 700,
                mb: 0.5,
                fontFamily: 'monospace',
              }}
            >
              {formatValue(value)}
            </Typography>
            
            <Typography
              variant="body1"
              color="text.primary"
              sx={{ fontWeight: 600 }}
            >
              {title}
            </Typography>
            
            {subtitle && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          
          {icon && (
            <Box
              sx={{
                color: getColorValue(),
                opacity: 0.7,
                ml: 2,
              }}
            >
              {icon}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
