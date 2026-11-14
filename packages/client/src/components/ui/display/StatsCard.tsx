import { Card, CardContent, Typography, Box } from '@mui/material';
import { Theme } from '@mui/material/styles';
import { StatsCardProps } from '../../../types/ui';
import { PHONE } from '../../../theme/media';
import { TWO_LINES } from '../phoneLayout';
import { brandText } from '../../../theme/palettes';

/** A headline figure (already formatted) with its title, a note under it, and an icon. */
export function StatsCard({ title, value, subtitle, icon, color }: StatsCardProps) {
  // The brand green is too light for a figure on white: its darker text shade there
  const tint = (theme: Theme) => (color === 'primary' ? brandText(theme.palette.mode) : theme.palette[color].main);
  return (
    <Card sx={{ height: '100%' }}>
      {/* Two to a row on a phone: tighter, without the icon */}
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 }, [PHONE]: { p: 2, '&:last-child': { pb: 2 } } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={theme => ({
                color: tint(theme),
                fontWeight: 700,
                mb: 0.5,
                fontFamily: '"Roboto Mono", monospace',
                // A long figure shrinks with the phone's width, and breaks rather than leaving its card
                overflowWrap: 'anywhere',
                [PHONE]: { fontSize: 'clamp(1rem, 5.2vw, 1.25rem)' },
              })}
            >
              {value}
            </Typography>
            <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {/* Two lines at most on a phone: a long task name doesn't stretch the card past its neighbour */}
            <Typography variant="body2" color="text.secondary" title={subtitle} sx={{ mt: 0.5, [PHONE]: TWO_LINES }}>
              {subtitle}
            </Typography>
          </Box>
          <Box sx={theme => ({ color: tint(theme), opacity: 0.7, flexShrink: 0, [PHONE]: { display: 'none' } })}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
