/**
 * Session Notes Dialog
 *
 * A session's notes (its own and its timers'), with the same editor and list
 * as the Notes page. Opened from a timer row, new notes belong to that timer;
 * otherwise to the session. Task-wide notes live on the Notes page.
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { Notes as NotesIcon } from '@mui/icons-material';
// Imported directly (not via ../../ui or features/notes/index): those
// barrels lead back here.
import { NoteEditor } from '../../features/notes/NoteEditor';
import { NotesList } from '../../features/notes/NotesList';
import { useTaskNotes } from '../../../hooks/useTaskNotes';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import { TaskNote } from '../../../types/notes';
import { formatDate } from '../../../utils/formatters';
import { parseDateStringLocal } from '../../../utils/dateHelpers';

interface SessionNotesDialogProps {
  open: boolean;
  onClose: () => void;
  session: TaskSession | null;
  /** Opened from this timer: new notes are timer notes for it. */
  timerInstanceId?: string | null;
  tasks: Task[];
}

export function SessionNotesDialog({
  open,
  onClose,
  session,
  timerInstanceId = null,
  tasks,
}: SessionNotesDialogProps) {
  const { notes, createNote, updateNote, deleteNote, archiveNote, unarchiveNote } = useTaskNotes();
  const { getTemplateById } = useNoteTemplates();
  // The note open in the editor: a new one, an existing one, or none
  const [editing, setEditing] = useState<TaskNote | 'new' | null>(null);
  const [editorCollapsed, setEditorCollapsed] = useState(false);

  const sessionNotes = useMemo(
    () => (session ? notes.filter(note => note.sessionId === session.id) : []),
    [notes, session]
  );

  if (!session) return null;

  const task = tasks.find(t => t.id === session.taskId);
  const timer = timerInstanceId
    ? session.timerInstances.find(instance => instance.id === timerInstanceId)
    : undefined;

  const editorTemplate =
    editing === 'new'
      ? (task?.defaultNoteTemplateId && getTemplateById(task.defaultNoteTemplateId)) || null
      : editing
        ? getTemplateById(editing.templateId) ?? null
        : null;

  const openEditor = (note: TaskNote | 'new') => {
    setEditorCollapsed(false);
    setEditing(note);
  };

  const handleClose = () => {
    setEditing(null);
    onClose();
  };

  const handleDeleteFromEditor = async (noteId: string) => {
    await deleteNote(noteId);
    setEditing(null);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <NotesIcon />
          <Box>
            <Typography variant="h6" component="span" sx={{ display: 'block' }}>
              Notes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {session.taskName} · {formatDate(parseDateStringLocal(session.date))}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {timer && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            New notes are for the timer started at{' '}
            {new Date(timer.startTime).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
            .
          </Typography>
        )}

        {editing && (
          <Box sx={{ mb: 3 }}>
            <NoteEditor
              key={editing === 'new' ? 'new' : editing.id}
              taskId={session.taskId}
              template={editorTemplate}
              existingNote={editing === 'new' ? null : editing}
              sessionId={session.id}
              timerInstanceId={editing === 'new' ? timerInstanceId : editing.timerInstanceId}
              noteLevel={timerInstanceId ? 'timer' : 'session'}
              onSaveNote={createNote}
              onUpdateNote={updateNote}
              onDeleteNote={handleDeleteFromEditor}
              isCollapsed={editorCollapsed}
              onToggleCollapse={() => setEditorCollapsed(collapsed => !collapsed)}
              onCloseEditor={() => setEditing(null)}
            />
          </Box>
        )}

        <NotesList
          taskId={session.taskId}
          notes={sessionNotes}
          onEditNote={openEditor}
          onDeleteNote={deleteNote}
          onCreateNote={() => openEditor('new')}
          onArchiveNote={archiveNote}
          onUnarchiveNote={unarchiveNote}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
