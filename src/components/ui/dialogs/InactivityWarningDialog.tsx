/**
 * Inactivity Warning Dialog
 * 
 * Shows a warning when user inactivity is detected and allows them to
 * continue working or pause the timer.
 */

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
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            boxShadow: 3,
          }
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
