
import { Box, Typography, Chip } from '@mui/material';
import { AccessTime } from '@mui/icons-material';
import { TimerDisplayProps } from '../../../types/ui';
import { formatTime } from '../../../utils/formatters';

/**
 * Timer display component showing elapsed time and optional task name
 * Provides consistent formatting for timer displays throughout the app
 */
export function TimerDisplay({
  elapsed,
  isRunning,
  taskName,
  showTaskName = true,
  size = 'medium',
  sx,
}: TimerDisplayProps) {
  const getTypographyVariant = () => {
    switch (size) {
      case 'small':
        return 'body2';
      case 'large':
        return 'h4';
      default:
        return 'h6';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 'small';
      case 'large':
        return 'large';
      default:
        return 'medium';
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        ...sx,
      }}
    >
      {/* Timer Display */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: size === 'large' ? 2 : 1,
          borderRadius: 2,
          bgcolor: isRunning ? 'success.dark' : 'grey.800',
          color: 'white',
          minWidth: size === 'large' ? 200 : size === 'small' ? 120 : 160,
          justifyContent: 'center',
        }}
      >
        <AccessTime fontSize={getIconSize()} />
        <Typography
          variant={getTypographyVariant()}
          component="div"
          sx={{
            fontFamily: '"Roboto Mono", monospace',
            fontWeight: 600,
            letterSpacing: 1,
          }}
        >
          {formatTime(elapsed)}
        </Typography>
      </Box>

      {/* Task Name */}
      {showTaskName && taskName && (
        <Chip
          label={taskName}
          size={size === 'large' ? 'medium' : 'small'}
          variant="outlined"
          sx={{
            maxWidth: size === 'large' ? 300 : size === 'small' ? 150 : 200,
            '& .MuiChip-label': {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
      )}

      {/* Running Indicator */}
      {isRunning && (
        <Typography
          variant="caption"
          sx={{
            color: 'success.main',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Running
        </Typography>
      )}
    </Box>
  );
}
