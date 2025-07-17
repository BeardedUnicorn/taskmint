import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
} from '@mui/material';
import { TaskSession } from '../../../types/timer';

interface EditSessionDialogProps {
  open: boolean;
  session: TaskSession | null;
  onClose: () => void;
  onSave: (sessionId: string, updates: { notes?: string }) => void;
}

export function EditSessionDialog({ open, session, onClose, onSave }: EditSessionDialogProps) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (session) {
      setNotes(session.notes || '');
    }
  }, [session]);

  const handleSave = () => {
    if (session) {
      onSave(session.id, {
        notes: notes.trim(),
      });
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Session Notes</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 2 }}>
          <Typography variant="h6">{session?.taskName}</Typography>
          <Typography variant="body2" color="text.secondary">Session Date: {session?.date}</Typography>
          <TextField
            label="Session Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={4}
            fullWidth
            autoFocus
            placeholder="Add or edit notes for this session..."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="secondary">
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={!session}>
          Save Notes
        </Button>
      </DialogActions>
    </Dialog>
  );
}