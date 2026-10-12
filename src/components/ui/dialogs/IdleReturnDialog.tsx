/**
 * Idle Return Dialog
 *
 * "Welcome back": idle detection paused the running timer as of when input
 * stopped, so the away time isn't counted. The user decides whether to
 * discard it and resume, keep it (they were reading or watching without
 * touching the mouse) and resume, or stay paused.
 */

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { IdleChoice, IdlePause } from '../../../types/timer';
import { formatDuration } from '../../../utils/formatters';

interface IdleReturnDialogProps {
  pending: IdlePause | null;
  onResolve: (choice: IdleChoice) => void;
  isResolving?: boolean;
  error?: string | null;
}

/** "25 min" / "1h 5m": short and readable for the question. */
function awayLabel(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes} min` : formatDuration(minutes * 60_000);
}

export function IdleReturnDialog({ pending, onResolve, isResolving = false, error }: IdleReturnDialogProps) {
  if (!pending) return null;

  const pausedAt = new Date(pending.idleSince).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const away = awayLabel(pending.awayMs);

  return (
    // Escape answers Stay paused; a stray click outside doesn't answer at all
    // (the tray keeps offering the choices until one is made).
    <Dialog
      open
      onClose={(_, reason) => {
        if (reason !== 'backdropClick') onResolve('stayPaused');
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Welcome back</DialogTitle>
      <DialogContent>
        <DialogContentText>
          <strong>{pending.taskName}</strong> paused at {pausedAt}, when your computer stopped
          getting input. You were away for {away}, which isn't counted unless you keep it.
        </DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onResolve('stayPaused')} color="secondary" disabled={isResolving}>
          Stay paused
        </Button>
        <Button onClick={() => onResolve('keepResume')} disabled={isResolving}>
          Keep {away} and resume
        </Button>
        <Button
          onClick={() => onResolve('discardResume')}
          variant="contained"
          autoFocus
          disabled={isResolving}
        >
          Discard and resume
        </Button>
      </DialogActions>
    </Dialog>
  );
}
