
import { Button } from '@mui/material';
import { PlayArrow, Stop } from '@mui/icons-material';
import { TimerButtonProps } from '../../../types/ui';

/**
 * Specialized button component for timer start/stop functionality
 * Automatically switches between start and stop states with appropriate styling
 */
export function TimerButton({
  isRunning,
  onStart,
  onStop,
  disabled = false,
  size = 'large',
  sx,
}: TimerButtonProps) {
  const handleClick = () => {
    if (isRunning) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <Button
      variant="contained"
      color={isRunning ? 'error' : 'primary'}
      onClick={handleClick}
      disabled={disabled}
      startIcon={isRunning ? <Stop /> : <PlayArrow />}
      size={size}
      fullWidth
      sx={{
        py: size === 'large' ? 1.5 : 1,
        fontSize: size === 'large' ? '1.1rem' : undefined,
        fontWeight: 600,
        ...sx,
      }}
    >
      {isRunning ? 'Stop Timer' : 'Start Timer'}
    </Button>
  );
}
