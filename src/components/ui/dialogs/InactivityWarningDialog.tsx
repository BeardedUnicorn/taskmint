/**
 * Inactivity Warning Dialog
 * 
 * Shows a warning when user inactivity is detected and allows them to
 * continue working or pause the timer.
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  Warning as WarningIcon,
  PlayArrow as ContinueIcon,
  Pause as PauseIcon,
} from '@mui/icons-material';
import { InactivityWarningProps } from '../../../types/timer';

export function InactivityWarningDialog({
  remainingSeconds,
  onContinue,
  onPause,
}: InactivityWarningProps) {
  const progress = Math.min((remainingSeconds / 30) * 100, 100); // Assuming 30 seconds max warning

  const formatTime = (seconds: number): string => {
    return `${seconds}s`;
  };

  return (
    <Dialog
      open={remainingSeconds > 0}
      disableEscapeKeyDown
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: 3,
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        pb: 1,
        color: 'warning.main'
      }}>
        <WarningIcon />
        Inactivity Detected
      </DialogTitle>

      <DialogContent sx={{ pb: 2 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          No activity detected for the configured time period.
        </Alert>

        <Typography variant="body1" sx={{ mb: 2 }}>
          Your timer will be automatically paused in <strong>{formatTime(remainingSeconds)}</strong> unless you continue working.
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Time remaining:
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ 
              height: 8, 
              borderRadius: 4,
              backgroundColor: 'grey.200',
              '& .MuiLinearProgress-bar': {
                backgroundColor: remainingSeconds <= 10 ? 'error.main' : 'warning.main',
                borderRadius: 4,
              }
            }} 
          />
          <Typography 
            variant="h6" 
            align="center" 
            sx={{ 
              mt: 1, 
              fontFamily: 'monospace',
              color: remainingSeconds <= 10 ? 'error.main' : 'warning.main',
              fontWeight: 'bold'
            }}
          >
            {formatTime(remainingSeconds)}
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary">
          Click "Continue Working" to dismiss this warning and continue timing, 
          or "Pause Timer" to manually pause now.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button
          onClick={onPause}
          variant="outlined"
          color="error"
          startIcon={<PauseIcon />}
          sx={{ minWidth: 140 }}
        >
          Pause Timer
        </Button>
        <Button
          onClick={onContinue}
          variant="contained"
          color="primary"
          startIcon={<ContinueIcon />}
          sx={{ minWidth: 140 }}
          autoFocus
        >
          Continue Working
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Hook to manage inactivity warning dialog state
 */
export function useInactivityWarning() {
  const [isWarningShown, setIsWarningShown] = React.useState(false);
  const [remainingSeconds, setRemainingSeconds] = React.useState(0);
  const [currentTimerInstance, setCurrentTimerInstance] = React.useState<any>(null);

  // Listen for inactivity events
  React.useEffect(() => {
    const handleInactivityWarning = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { timerInstance, warningDuration } = customEvent.detail;
      setCurrentTimerInstance(timerInstance);
      setRemainingSeconds(warningDuration);
      setIsWarningShown(true);

      // Start countdown
      const interval = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsWarningShown(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    };

    const handleActivityResume = () => {
      setIsWarningShown(false);
      setRemainingSeconds(0);
    };

    window.addEventListener('timer-inactivity-warning', handleInactivityWarning);
    window.addEventListener('timer-continue-activity', handleActivityResume);

    return () => {
      window.removeEventListener('timer-inactivity-warning', handleInactivityWarning);
      window.removeEventListener('timer-continue-activity', handleActivityResume);
    };
  }, []);

  const handleContinue = () => {
    setIsWarningShown(false);
    setRemainingSeconds(0);
    window.dispatchEvent(new CustomEvent('timer-continue-activity', {
      detail: { reason: 'user-action', timestamp: new Date() }
    }));
  };

  const handlePause = () => {
    setIsWarningShown(false);
    setRemainingSeconds(0);
    window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
      detail: { reason: 'user-action', timestamp: new Date() }
    }));
  };

  return {
    isWarningShown,
    remainingSeconds,
    currentTimerInstance,
    handleContinue,
    handlePause,
  };
}
