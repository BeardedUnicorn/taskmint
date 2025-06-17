/**
 * Task Notes Integration Component
 * 
 * Integrates notes functionality into task views with template selection,
 * note editing, and seamless task-note management.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Chip,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Notes as NotesIcon,
  Description as TemplateIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { TaskNote } from '../../../types/notes';
import { NoteEditor, NotesList } from '../notes';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { useTaskNotes } from '../../../hooks/useTaskNotes';

interface TaskNotesIntegrationProps {
  task: Task;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TaskNotesIntegration({
  task,
  isCollapsed = false,
  onToggleCollapse,
}: TaskNotesIntegrationProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [editingNote, setEditingNote] = useState<TaskNote | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  // Hooks for templates and notes
  const { templates, getActiveTemplates } = useNoteTemplates();
  const {
    notes,
    createNote,
    updateNote,
    deleteNote,
    getNotesStats,
  } = useTaskNotes(task.id);

  const activeTemplates = getActiveTemplates();
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null;
  const notesStats = getNotesStats();

  // Auto-select first template if none selected and templates are available
  useEffect(() => {
    if (!selectedTemplateId && activeTemplates.length > 0) {
      setSelectedTemplateId(activeTemplates[0].id);
    }
  }, [selectedTemplateId, activeTemplates]);

  const handleTemplateChange = useCallback((templateId: string) => {
    if (editingNote) {
      const confirmChange = window.confirm(
        'Changing templates will discard any unsaved changes. Continue?'
      );
      if (!confirmChange) return;
      setEditingNote(null);
    }
    setSelectedTemplateId(templateId);
  }, [editingNote]);

  const handleSaveNote = useCallback(async (
    noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TaskNote> => {
    const savedNote = await createNote(noteData);
    setEditingNote(null);
    setShowNoteEditor(false);
    return savedNote;
  }, [createNote]);

  const handleUpdateNote = useCallback(async (
    noteId: string,
    updates: Partial<TaskNote>
  ): Promise<TaskNote> => {
    const updatedNote = await updateNote(noteId, updates);
    setEditingNote(null);
    setShowNoteEditor(false);
    return updatedNote;
  }, [updateNote]);

  const handleDeleteNote = useCallback(async (noteId: string): Promise<void> => {
    await deleteNote(noteId);
    if (editingNote?.id === noteId) {
      setEditingNote(null);
      setShowNoteEditor(false);
    }
  }, [deleteNote, editingNote]);

  const handleEditNote = useCallback((note: TaskNote) => {
    setEditingNote(note);
    setSelectedTemplateId(note.templateId);
    setShowNoteEditor(true);
  }, []);

  const handleCreateNote = useCallback(() => {
    setEditingNote(null);
    setShowNoteEditor(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingNote(null);
    setShowNoteEditor(false);
  }, []);

  if (isCollapsed) {
    return (
      <Paper 
        sx={{ 
          p: 2, 
          cursor: onToggleCollapse ? 'pointer' : 'default',
          '&:hover': onToggleCollapse ? { bgcolor: 'action.hover' } : {},
        }}
        onClick={onToggleCollapse}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotesIcon color="primary" />
          <Typography variant="subtitle1" fontWeight="medium">
            Task Notes
          </Typography>
          <Chip
            label={`${notesStats.totalNotes} notes`}
            size="small"
            color="primary"
            variant="outlined"
          />
          {notesStats.templatesUsed.length > 0 && (
            <Chip
              label={`${notesStats.templatesUsed.length} templates`}
              size="small"
              variant="outlined"
            />
          )}
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotesIcon color="primary" />
          <Typography variant="h6">
            Task Notes
          </Typography>
          <Chip
            label={`${notesStats.totalNotes} notes`}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>
        {onToggleCollapse && (
          <Button
            variant="outlined"
            size="small"
            onClick={onToggleCollapse}
          >
            Collapse
          </Button>
        )}
      </Box>

      {/* Template Selection */}
      {activeTemplates.length > 0 ? (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Note Template</InputLabel>
              <Select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                label="Note Template"
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {activeTemplates.map((template: any) => (
                  <MenuItem key={template.id} value={template.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TemplateIcon fontSize="small" />
                      {template.name} ({template.fields.length} fields)
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {selectedTemplate && !showNoteEditor && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateNote}
                size="small"
              >
                Add Note
              </Button>
            )}
          </Stack>
        </Box>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>
          No note templates available. Create templates in the Note Templates section to start adding structured notes to this task.
        </Alert>
      )}

      {/* Note Editor */}
      {showNoteEditor && selectedTemplate && (
        <Box sx={{ mb: 3 }}>
          <NoteEditor
            taskId={task.id}
            template={selectedTemplate}
            existingNote={editingNote}
            onSaveNote={handleSaveNote}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
            isCollapsed={false}
            onToggleCollapse={() => {}}
          />
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={handleCancelEdit}
              size="small"
            >
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {/* Template Info */}
      {selectedTemplate && !showNoteEditor && (
        <Box sx={{ mb: 3 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Template: {selectedTemplate.name}
            </Typography>
            {selectedTemplate.description && (
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {selectedTemplate.description}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
              {selectedTemplate.fields.map((field) => (
                <Chip
                  key={field.id}
                  label={`${field.label} (${field.type})`}
                  size="small"
                  variant="outlined"
                  color={field.required ? 'primary' : 'default'}
                />
              ))}
            </Box>
          </Paper>
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Notes List */}
      <NotesList
        taskId={task.id}
        notes={notes}
        onEditNote={handleEditNote}
        onDeleteNote={handleDeleteNote}
        onCreateNote={handleCreateNote}
      />

      {/* Notes Statistics */}
      {notesStats.totalNotes > 0 && (
        <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
          <Typography variant="subtitle2" gutterBottom color="text.primary">
            Notes Summary
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              Total Notes: {notesStats.totalNotes}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Templates Used: {notesStats.templatesUsed.length}
            </Typography>
            {notesStats.lastNoteDate && (
              <Typography variant="body2" color="text.secondary">
                Last Updated: {new Date(notesStats.lastNoteDate).toLocaleDateString()}
              </Typography>
            )}
          </Stack>
          {notesStats.templatesUsed.length > 0 && (
            <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {notesStats.templatesUsed.map((templateName: string) => (
                <Chip
                  key={templateName}
                  label={`${templateName}: ${notesStats.notesByTemplate[templateName]}`}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              ))}
            </Box>
          )}
        </Paper>
      )}
    </Paper>
  );
}
