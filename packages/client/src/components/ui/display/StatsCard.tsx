import { Card, CardContent, Typography, Box } from '@mui/material';
import { StatsCardProps } from '../../../types/ui';

/** A headline figure (already formatted) with its title, a note under it, and an icon. */
export function StatsCard({ title, value, subtitle, icon, color }: StatsCardProps) {
  const tint = `${color}.main`;
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ color: tint, fontWeight: 700, mb: 0.5, fontFamily: '"Roboto Mono", monospace' }}
            >
              {value}
            </Typography>
            <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          </Box>
          <Box sx={{ color: tint, opacity: 0.7, ml: 2 }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}
