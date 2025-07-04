/**
 * Task Notes Integration Component
 *
 * Integrates notes functionality into task views with note editing
 * and seamless task-note management.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
} from '@mui/material';
import {
  Notes as NotesIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { TaskNote, NoteTemplate } from '../../../types/notes';
import { NotesList, NoteEditor } from '../notes';
import { useTaskNotes } from '../../../hooks/useTaskNotes';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';

interface TaskNotesIntegrationProps {
  task: Task;
  timeEntryId?: string | null; // Optional time entry context
}

export function TaskNotesIntegration({
  task,
  timeEntryId,
}: TaskNotesIntegrationProps) {
  const [editingNote, setEditingNote] = useState<TaskNote | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [isCreatingNewNote, setIsCreatingNewNote] = useState(false);

  // Hooks for notes
  const {
    notes,
    createNote,
    updateNote,
    deleteNote,
    getNotesByTimeEntryId,
  } = useTaskNotes(task.id);

  // Hooks for templates
  const { templates } = useNoteTemplates();

  // Filter notes based on context
  const filteredNotes = timeEntryId
    ? getNotesByTimeEntryId(timeEntryId)
    : notes.filter(note => note.taskId === task.id);

  // const notesStats = getNotesStats(); // Commented out unused variable

  // Reset editor state when task changes
  useEffect(() => {
    setEditingNote(null);
  }, [task]);



  const handleDeleteNote = useCallback(async (noteId: string): Promise<void> => {
    await deleteNote(noteId);
    if (editingNote?.id === noteId) {
      setEditingNote(null);
      setSelectedTemplate(null);
    }
  }, [deleteNote, editingNote]);

  const handleEditNote = useCallback((note: TaskNote) => {
    setEditingNote(note);
    // Find the template for this note
    const template = templates.find(t => t.id === note.templateId);
    setSelectedTemplate(template || null);
    setIsEditorCollapsed(false);
  }, [templates]);

  const handleCreateNote = useCallback(() => {
    setEditingNote(null);
    
    // Check if task has a default template and use it
    if (task.defaultNoteTemplateId) {
      const defaultTemplate = templates.find(t => t.id === task.defaultNoteTemplateId);
      setSelectedTemplate(defaultTemplate || null);
    } else {
      setSelectedTemplate(null); // Clear any selected template if no default
    }
    
    setIsEditorCollapsed(false);
    setIsCreatingNewNote(true); // Indicate that a new note is being created
  }, [task.defaultNoteTemplateId, templates]);

  const handleSaveNote = useCallback(async (noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskNote> => {
    const savedNote = await createNote(noteData);
    setEditingNote(null);
    setSelectedTemplate(null);
    setIsCreatingNewNote(false); // Reset state after saving
    return savedNote;
  }, [createNote]);

  const handleUpdateNote = useCallback(async (noteId: string, updates: Partial<TaskNote>): Promise<TaskNote> => {
    const updatedNote = await updateNote(noteId, updates);
    setEditingNote(null);
    setSelectedTemplate(null);
    setIsCreatingNewNote(false); // Reset state after updating
    return updatedNote;
  }, [updateNote]);

  const handleToggleEditor = useCallback(() => {
    setIsEditorCollapsed(!isEditorCollapsed);
  }, [isEditorCollapsed]);



  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotesIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {timeEntryId ? 'Time Entry Notes' : 'Task Notes'}
          </Typography>
          <Chip
            label={`${filteredNotes.length} notes`}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {/* Note Editor - Show when editing or creating */}
        {(editingNote || selectedTemplate || isCreatingNewNote) && (
          <Box sx={{ mb: 3 }}>
            <NoteEditor
              taskId={task.id}
              template={selectedTemplate}
              existingNote={editingNote}
              timeEntryId={timeEntryId}
              onSaveNote={handleSaveNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              isCollapsed={isEditorCollapsed}
              onToggleCollapse={handleToggleEditor}
              onCloseEditor={() => {
                setEditingNote(null);
                setSelectedTemplate(null);
                setIsCreatingNewNote(false);
              }}
            />
          </Box>
        )}

        {/* Notes List */}
        <NotesList
          taskId={task.id}
          notes={filteredNotes}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
          onCreateNote={handleCreateNote}
        />

      {/* Notes Statistics */}
      {filteredNotes.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
          <Typography variant="subtitle2" gutterBottom color="text.primary">
            Notes Summary
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              {timeEntryId ? 'Time Entry Notes' : 'Total Notes'}: {filteredNotes.length}
            </Typography>
            {filteredNotes.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                Last Updated: {new Date(filteredNotes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0].updatedAt).toLocaleDateString()}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}
      </Box>
    </Box>
  );
}
