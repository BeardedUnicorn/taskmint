/**
 * Enhanced Notes Dialog
 * 
 * Supports creating and managing notes at different levels:
 * - Task-level notes (general task documentation)
 * - Session-level notes (notes for a specific task session)
 * - Timer-level notes (notes for individual timer instances)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  IconButton,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Notes as NotesIcon,
  Timer as TimerIcon,
  Task as TaskIcon,
  FolderOpen as SessionIcon,
} from '@mui/icons-material';
import { useNotification } from '../../../contexts/NotificationContext';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { useTaskNotes } from '../../../hooks/useTaskNotes';
import { NoteTemplate, TaskNote, TemplateField } from '../../../types/notes';

// Enhanced note types with hierarchy
interface Note {
  id: string;
  content: string;
  type: 'timer' | 'session' | 'task';
  taskId?: string;
  sessionId?: string;
  timerInstanceId?: string;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    duration?: number;
    timerState?: 'running' | 'paused' | 'stopped';
    sessionPhase?: 'planning' | 'working' | 'review';
    templateName?: string;
  };
}

interface EnhancedNotesDialogProps {
  open: boolean;
  onClose: () => void;
  activeTimerInstanceId?: string;
  activeSessionId?: string;
  activeTaskId?: string;
  taskName?: string;
}

// Note type configuration
const noteTypeConfig = {
  timer: {
    icon: <TimerIcon />,
    label: 'Timer Note',
    description: 'Notes specific to this timer instance',
    color: 'primary' as const,
  },
  session: {
    icon: <SessionIcon />,
    label: 'Session Note',
    description: 'Notes for the entire work session',
    color: 'secondary' as const,
  },
  task: {
    icon: <TaskIcon />,
    label: 'Task Note',
    description: 'Notes related to the task across all sessions',
    color: 'success' as const,
  },
};

// Enhanced note editor component with template support
const NoteEditor: React.FC<{
  note?: Note;
  type: Note['type'];
  onSave: (noteData: Partial<Note>) => Promise<void>;
  onCancel: () => void;
  contextIds: {
    taskId?: string;
    sessionId?: string;
    timerInstanceId?: string;
  };
}> = ({ note, type, onSave, onCancel, contextIds }) => {
  const { getActiveTemplates } = useNoteTemplates();
  const [content, setContent] = useState(note?.content || '');
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Get active templates
  const activeTemplates = getActiveTemplates();

  // Initialize field values when template is selected or note is loaded
  useEffect(() => {
    if (selectedTemplate) {
      const initialValues: Record<string, any> = {};
      
      // If editing an existing note, try to load its field values
      if (note && note.templateId === selectedTemplate.id) {
        try {
          const existingValues = JSON.parse(note.content);
          selectedTemplate.fields.forEach(field => {
            initialValues[field.id] = existingValues[field.id] !== undefined 
              ? existingValues[field.id] 
              : getDefaultFieldValue(field.type);
          });
        } catch {
          // Fallback to default values if parsing fails
          selectedTemplate.fields.forEach(field => {
            initialValues[field.id] = getDefaultFieldValue(field.type);
          });
        }
      } else {
        // New note - use default values
        selectedTemplate.fields.forEach(field => {
          initialValues[field.id] = getDefaultFieldValue(field.type);
        });
      }
      
      setFieldValues(initialValues);
    } else {
      setFieldValues({});
    }
  }, [selectedTemplate, note]);

  // Initialize template selection for existing notes
  useEffect(() => {
    if (note && note.templateId && note.templateId !== 'free-form') {
      const template = activeTemplates.find(t => t.id === note.templateId);
      if (template) {
        setSelectedTemplate(template);
      }
    }
  }, [note, activeTemplates]);

  const getDefaultFieldValue = (fieldType: string) => {
    switch (fieldType) {
      case 'text':
        return '';
      case 'number':
        return '';
      case 'date':
        return '';
      case 'checkbox':
        return false;
      case 'select':
        return '';
      default:
        return '';
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === '') {
      setSelectedTemplate(null);
      setContent(note?.content || '');
      return;
    }
    
    const template = activeTemplates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
    }
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const renderTemplateField = (field: TemplateField) => {
    const value = fieldValues[field.id] || '';

    switch (field.type) {
      case 'text':
        return (
          <TextField
            key={field.id}
            label={field.label}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            fullWidth
            multiline
            rows={3}
            size="small"
          />
        );
      case 'number':
        return (
          <TextField
            key={field.id}
            label={field.label}
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            fullWidth
            size="small"
            slotProps={{
              htmlInput: {
                min: field.validation?.min,
                max: field.validation?.max,
              }
            }}
          />
        );
      case 'date':
        return (
          <TextField
            key={field.id}
            label={field.label}
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.required}
            fullWidth
            size="small"
            slotProps={{
              inputLabel: { shrink: true }
            }}
          />
        );
      case 'checkbox':
        return (
          <FormControl key={field.id} component="fieldset">
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={!!value}
                onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <Typography variant="body2">{field.label}</Typography>
            </Box>
          </FormControl>
        );
      case 'select':
        return (
          <FormControl key={field.id} fullWidth size="small" required={field.required}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={value || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              label={field.label}
            >
              {!field.required && (
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
              )}
              {(field.options || []).map((option, index) => (
                <MenuItem key={index} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      default:
        return null;
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate && !content.trim()) return;

    setIsLoading(true);
    try {
      let noteData: Partial<Note>;

      if (selectedTemplate) {
        // Template-based note
        noteData = {
          content: JSON.stringify(fieldValues), // Store field values as JSON
          type,
          templateId: selectedTemplate.id,
          ...contextIds,
          metadata: {
            timerState: type === 'timer' ? 'running' : undefined,
            sessionPhase: type === 'session' ? 'working' : undefined,
            templateName: selectedTemplate.name,
          },
        };
      } else {
        // Free-form note
        noteData = {
          content: content.trim(),
          type,
          templateId: undefined,
          ...contextIds,
          metadata: {
            timerState: type === 'timer' ? 'running' : undefined,
            sessionPhase: type === 'session' ? 'working' : undefined,
          },
        };
      }

      await onSave(noteData);
    } finally {
      setIsLoading(false);
    }
  };

  const validateFields = () => {
    if (!selectedTemplate) return true;
    
    return selectedTemplate.fields.every(field => {
      if (!field.required) return true;
      const value = fieldValues[field.id];
      return value !== undefined && value !== null && value !== '';
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Template selection */}
      <FormControl size="small">
        <InputLabel>Note Template</InputLabel>
        <Select
          value={selectedTemplate?.id || ''}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          label="Note Template"
        >
          <MenuItem value="">
            <em>Free-form note</em>
          </MenuItem>
          {activeTemplates.map(template => (
            <MenuItem key={template.id} value={template.id}>
              {template.name}
              {template.description && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  - {template.description}
                </Typography>
              )}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Template fields or free-form content */}
      {selectedTemplate ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {selectedTemplate.description}
          </Typography>
          {selectedTemplate.fields
            .sort((a, b) => a.order - b.order)
            .map(field => renderTemplateField(field))}
        </Box>
      ) : (
        <TextField
          multiline
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Enter your ${type} note...`}
          variant="outlined"
          fullWidth
        />
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={(!selectedTemplate && !content.trim()) || (selectedTemplate && !validateFields()) || isLoading}
          startIcon={<SaveIcon />}
        >
          Save Note
        </Button>
      </Box>
    </Box>
  );
};

// Note list component
const NoteList: React.FC<{
  notes: Note[];
  type: Note['type'];
  onEdit: (note: Note) => void;
  onDelete: (noteId: string) => void;
}> = ({ notes, type, onEdit, onDelete }) => {
  const { getTemplateById } = useNoteTemplates();
  const typeNotes = notes.filter(note => note.type === type);

  if (typeNotes.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <NotesIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
        <Typography variant="body2">
          No {type} notes yet. Create your first note above.
        </Typography>
      </Box>
    );
  }

  const renderNoteContent = (note: Note) => {
    if (!note.templateId || note.templateId === 'free-form') {
      // Free-form note
      return (
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {note.content}
        </Typography>
      );
    }

    // Template-based note
    const template = getTemplateById(note.templateId);
    let fieldValues: Record<string, any> = {};
    
    try {
      fieldValues = JSON.parse(note.content);
    } catch {
      // Fallback for non-JSON content
      return (
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {note.content}
        </Typography>
      );
    }

    if (!template) {
      return (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Template: {note.metadata?.templateName || 'Unknown'}
          </Typography>
          <Typography variant="body1">
            {JSON.stringify(fieldValues, null, 2)}
          </Typography>
        </Box>
      );
    }

    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Template: {template.name}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {template.fields
            .sort((a, b) => a.order - b.order)
            .map(field => {
              const value = fieldValues[field.id];
              if (value === undefined || value === null || value === '') return null;
              
              return (
                <Box key={field.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {field.label}:
                  </Typography>
                  <Typography 
                    variant="body2" 
                    sx={{ pl: 1 }}
                  >
                    {field.type === 'checkbox' ? (value ? 'Yes' : 'No') : String(value)}
                  </Typography>
                </Box>
              );
            })}
        </Box>
      </Box>
    );
  };

  return (
    <List>
      {typeNotes.map((note, index) => (
        <React.Fragment key={note.id}>
          <ListItem alignItems="flex-start">
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(note.createdAt).toLocaleString()}
                  </Typography>
                  {note.templateId && note.templateId !== 'free-form' && (
                    <Chip 
                      label="Template" 
                      size="small" 
                      variant="outlined" 
                      color="primary"
                    />
                  )}
                </Box>
              }
              secondary={renderNoteContent(note)}
            />
            <ListItemSecondaryAction>
              <IconButton
                edge="end"
                onClick={() => onEdit(note)}
                size="small"
                sx={{ mr: 1 }}
                aria-label="Edit note"
              >
                <EditIcon />
              </IconButton>
              <IconButton
                edge="end"
                onClick={() => onDelete(note.id)}
                size="small"
                color="error"
                aria-label="Delete note"
              >
                <DeleteIcon />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
          {index < typeNotes.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </List>
  );
};

// Main enhanced notes dialog
export function EnhancedNotesDialog({
  open,
  onClose,
  activeTimerInstanceId,
  activeSessionId,
  activeTaskId,
  taskName,
}: EnhancedNotesDialogProps) {
  const { showError, showSuccess } = useNotification();
  const { 
    notes: taskNotes, 
    createNote, 
    updateNote, 
    deleteNote,
    getNotesBySessionId,
    getNotesByTimerInstanceId 
  } = useTaskNotes();
  
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeTab, setActiveTab] = useState<Note['type']>(() => {
    const types = getAvailableTypes();
    return types[0] || 'task';
  });
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load notes based on context
  useEffect(() => {
    if (!open) return;

    const loadNotes = () => {
      setIsLoading(true);
      try {
        let contextNotes: TaskNote[] = [];
        
        if (activeTimerInstanceId) {
          contextNotes = getNotesByTimerInstanceId(activeTimerInstanceId);
        } else if (activeSessionId) {
          contextNotes = getNotesBySessionId(activeSessionId);
        } else if (activeTaskId) {
          contextNotes = taskNotes.filter(note => note.taskId === activeTaskId);
        }

        // Convert TaskNote to Note format for compatibility
        const convertedNotes: Note[] = contextNotes.map(note => ({
          id: note.id,
          // Only stringify field values for templated notes
          content: note.templateId && note.templateId !== 'free-form'
            ? JSON.stringify(note.fieldValues)
            : String((note.fieldValues as any)?.content || ''),
          type: (note.noteLevel || 'task') as Note['type'],
          taskId: note.taskId,
          sessionId: note.sessionId || undefined,
          timerInstanceId: note.timerInstanceId || undefined,
          templateId: note.templateId,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          metadata: {
            templateName: note.templateName,
          },
        }));

        setNotes(convertedNotes);
      } catch (error) {
        console.error('Failed to load notes:', error);
        showError('Failed to load notes');
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
  }, [open, activeTaskId, activeSessionId, activeTimerInstanceId, taskNotes, getNotesBySessionId, getNotesByTimerInstanceId, showError]);

  // Save note handler
  const handleSaveNote = useCallback(async (noteData: Partial<Note>) => {
    try {
      let fieldValues: Record<string, any>;
      
      if (noteData.templateId) {
        // Template-based note - content is JSON string of field values
        try {
          fieldValues = JSON.parse(noteData.content || '{}');
        } catch {
          fieldValues = { content: noteData.content || '' };
        }
      } else {
        // Free-form note
        fieldValues = { content: noteData.content || '' };
      }

      const taskNoteData = {
        taskId: noteData.taskId!,
        templateId: noteData.templateId || 'free-form',
        templateName: noteData.metadata?.templateName || 'Free-form Note',
        fieldValues,
        sessionId: noteData.sessionId || null,
        timerInstanceId: noteData.timerInstanceId || null,
        noteLevel: noteData.type as 'task' | 'session' | 'timer',
      };

      let savedNote: TaskNote;
      if (editingNote) {
        savedNote = await updateNote(editingNote.id, taskNoteData);
      } else {
        savedNote = await createNote(taskNoteData);
      }

      // Convert back to Note format and update local state
      const convertedNote: Note = {
        id: savedNote.id,
        // Preserve plain text for free-form notes
        content: savedNote.templateId && savedNote.templateId !== 'free-form'
          ? JSON.stringify(savedNote.fieldValues)
          : String((savedNote.fieldValues as any)?.content || ''),
        type: (savedNote.noteLevel || 'task') as Note['type'],
        taskId: savedNote.taskId,
        sessionId: savedNote.sessionId || undefined,
        timerInstanceId: savedNote.timerInstanceId || undefined,
        templateId: savedNote.templateId,
        createdAt: savedNote.createdAt,
        updatedAt: savedNote.updatedAt,
        metadata: {
          templateName: savedNote.templateName,
        },
      };

      setNotes(prev => {
        if (editingNote) {
          return prev.map(n => n.id === convertedNote.id ? convertedNote : n);
        } else {
          return [...prev, convertedNote];
        }
      });

      setShowEditor(false);
      setEditingNote(null);
      showSuccess('Note saved successfully');

    } catch (error) {
      console.error('Failed to save note:', error);
      const message = error instanceof Error ? error.message : 'Failed to save note';
      showError(message);
    }
  }, [editingNote, createNote, updateNote, showError, showSuccess]);

  // Delete note handler
  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      showSuccess('Note deleted successfully');
    } catch (error) {
      console.error('Failed to delete note:', error);
      showError('Failed to delete note');
    }
  }, [deleteNote, showError, showSuccess]);

  // Edit note handler
  const handleEditNote = useCallback((note: Note) => {
    setEditingNote(note);
    setActiveTab(note.type);
    setShowEditor(true);
  }, []);

  // Add new note handler
  const handleAddNote = useCallback(() => {
    setEditingNote(null);
    setShowEditor(true);
  }, []);

  // Cancel editor
  const handleCancelEditor = useCallback(() => {
    setShowEditor(false);
    setEditingNote(null);
  }, []);

  // Get context IDs for current tab
  const getContextIds = () => {
    const base = { taskId: activeTaskId };
    
    switch (activeTab) {
      case 'timer':
        return {
          ...base,
          sessionId: activeSessionId,
          timerInstanceId: activeTimerInstanceId,
        };
      case 'session':
        return {
          ...base,
          sessionId: activeSessionId,
        };
      case 'task':
        return base;
      default:
        return base;
    }
  };

  // Get available note types based on context
  function getAvailableTypes(): Note['type'][] {
    const types: Note['type'][] = [];

    if (activeTimerInstanceId) {
      types.push('timer');
    } else if (activeSessionId) {
      const sessionNotes = getNotesBySessionId(activeSessionId);
      if (sessionNotes.some(n => n.noteLevel === 'timer' || n.timerInstanceId)) {
        types.push('timer');
      }
    }

    if (activeSessionId) types.push('session');
    if (activeTaskId) types.push('task');

    return types;
  }

  const availableTypes = getAvailableTypes();

  // Reset active tab if available types change
  useEffect(() => {
    if (availableTypes.length > 0) {
      setActiveTab(availableTypes[0]);
    }
  }, [activeTaskId, activeSessionId, activeTimerInstanceId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: { height: '80vh' }
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <NotesIcon />
          <Box>
            <Typography variant="h6">Notes</Typography>
            {taskName && (
              <Typography variant="body2" color="text.secondary">
                {taskName}
              </Typography>
            )}
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {isLoading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography>Loading notes...</Typography>
          </Box>
        ) : availableTypes.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography>No note types available for this context.</Typography>
          </Box>
        ) : (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Note type tabs */}
            <Tabs
              value={activeTab}
              onChange={(_, newTab) => setActiveTab(newTab)}
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
            >
              {availableTypes.map(type => (
                <Tab
                  key={type}
                  value={type}
                  label={noteTypeConfig[type].label}
                  icon={noteTypeConfig[type].icon}
                  iconPosition="start"
                />
              ))}
            </Tabs>

            {/* Add note button */}
            <Box sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddNote}
                disabled={
                  showEditor || (activeTab === 'timer' && !activeTimerInstanceId)
                }
              >
                Add {noteTypeConfig[activeTab].label}
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {activeTab === 'timer' && !activeTimerInstanceId
                  ? 'Timer notes can only be added from specific timer instances.'
                  : noteTypeConfig[activeTab].description}
              </Typography>
            </Box>

            {/* Note editor */}
            {showEditor && (
              <Box sx={{ mb: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="h6" gutterBottom>
                  {editingNote ? 'Edit' : 'Add'} {noteTypeConfig[activeTab].label}
                </Typography>
                <NoteEditor
                  note={editingNote || undefined}
                  type={activeTab}
                  onSave={handleSaveNote}
                  onCancel={handleCancelEditor}
                  contextIds={getContextIds()}
                />
              </Box>
            )}

            {/* Notes list */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <NoteList
                notes={notes}
                type={activeTab}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
              />
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
