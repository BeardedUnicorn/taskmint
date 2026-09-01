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
import { formatDate } from '../../../utils/formatters';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { ConfirmDialog } from './ConfirmDialog';

interface EditSessionDialogProps {
  open: boolean;
  session: TaskSession | null;
  onClose: () => void;
  onSave: (sessionId: string, updates: { notes?: string }) => void;
}

export function EditSessionDialog({ open, session, onClose, onSave }: EditSessionDialogProps) {
  const [notes, setNotes] = useState('');
  const [initialNotes, setInitialNotes] = useState('');
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const hasChanges = notes !== initialNotes;

  useEffect(() => {
    if (session) {
      const currentNotes = session.notes || '';
      setNotes(currentNotes);
      setInitialNotes(currentNotes);
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
    if (hasChanges) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Session Notes</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <Typography variant="h6">{session?.taskName}</Typography>
            <Typography variant="body2" color="text.secondary">
              Session Date: {session ? formatDate(parseDateStringLocal(session.date)) : ''}
            </Typography>
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

      <ConfirmDialog
        open={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        onConfirm={onClose}
        title="Discard changes?"
        message="Your edits to the session notes will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        severity="warning"
      />
    </>
  );
}
