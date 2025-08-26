import { useState, useEffect } from 'react';
import { TextField, Stack, Typography } from '@mui/material';
import { TaskSession } from '../../../types/timer';
import { FormDialog } from './FormDialog';

interface EditSessionDialogProps {
  open: boolean;
  session: TaskSession | null;
  onClose: () => void;
  onSave: (sessionId: string, updates: { notes?: string }) => void;
}

export function EditSessionDialog({ open, session, onClose, onSave }: EditSessionDialogProps) {
  const [notes, setNotes] = useState('');
  const [initialNotes, setInitialNotes] = useState('');
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
    if (hasChanges && !window.confirm('Discard your changes?')) {
      return;
    }
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Edit Session Notes"
      onSubmit={handleSave}
      submitLabel="Save Notes"
      submitDisabled={!session}
    >
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
    </FormDialog>
  );
}
