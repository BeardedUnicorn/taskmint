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
  Autocomplete,
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
import { invoke } from '@tauri-apps/api/core';
import { useNotification } from '../../../contexts/NotificationContext';

// Enhanced note types with hierarchy
interface Note {
  id: string;
  content: string;
  type: 'timer' | 'session' | 'task';
  taskId?: string;
  sessionId?: string;
  timerInstanceId?: string;
  templateId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: {
    duration?: number;
    timerState?: 'running' | 'paused' | 'stopped';
    sessionPhase?: 'planning' | 'working' | 'review';
  };
}

interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  type: 'timer' | 'session' | 'task';
  isDefault: boolean;
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

// Note editor component
const NoteEditor: React.FC<{
  note?: Note;
  type: Note['type'];
  templates: NoteTemplate[];
  onSave: (noteData: Partial<Note>) => Promise<void>;
  onCancel: () => void;
  contextIds: {
    taskId?: string;
    sessionId?: string;
    timerInstanceId?: string;
  };
}> = ({ note, type, templates, onSave, onCancel, contextIds }) => {
  const [content, setContent] = useState(note?.content || '');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [tags, setTags] = useState<string[]>(note?.tags || []);
  const [isLoading, setIsLoading] = useState(false);

  const typeTemplates = templates.filter(t => t.type === type);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setContent(template.content);
      setSelectedTemplate(templateId);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) return;

    setIsLoading(true);
    try {
      const noteData: Partial<Note> = {
        content: content.trim(),
        type,
        tags,
        templateId: selectedTemplate || undefined,
        ...contextIds,
        metadata: {
          timerState: type === 'timer' ? 'running' : undefined,
          sessionPhase: type === 'session' ? 'working' : undefined,
        },
      };

      await onSave(noteData);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Template selection */}
      {typeTemplates.length > 0 && (
        <FormControl size="small">
          <InputLabel>Template</InputLabel>
          <Select
            value={selectedTemplate}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            label="Template"
          >
            <MenuItem value="">
              <em>Free-form note</em>
            </MenuItem>
            {typeTemplates.map(template => (
              <MenuItem key={template.id} value={template.id}>
                {template.name}
                {template.isDefault && <Chip size="small" label="Default" sx={{ ml: 1 }} />}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Content editor */}
      <TextField
        multiline
        rows={6}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={`Enter your ${type} note...`}
        variant="outlined"
        fullWidth
      />

      {/* Tags input */}
      <Autocomplete
        multiple
        freeSolo
        options={[]}
        value={tags}
        onChange={(_, newTags) => setTags(newTags)}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Tags"
            placeholder="Add tags..."
            size="small"
          />
        )}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              variant="outlined"
              label={option}
              size="small"
              {...getTagProps({ index })}
            />
          ))
        }
      />

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!content.trim() || isLoading}
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
                  {note.tags.map(tag => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" />
                  ))}
                </Box>
              }
              secondary={
                <Typography
                  variant="body1"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {note.content}
                </Typography>
              }
            />
            <ListItemSecondaryAction>
              <IconButton
                edge="end"
                onClick={() => onEdit(note)}
                size="small"
                sx={{ mr: 1 }}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                edge="end"
                onClick={() => onDelete(note.id)}
                size="small"
                color="error"
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
  const [notes, setNotes] = useState<Note[]>([]);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<Note['type']>('task');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load notes and templates
  useEffect(() => {
    if (!open) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const [notesData, templatesData] = await Promise.all([
          invoke<Note[]>('get_notes', {
            taskId: activeTaskId,
            sessionId: activeSessionId,
            timerInstanceId: activeTimerInstanceId,
          }),
          invoke<NoteTemplate[]>('get_note_templates'),
        ]);

        setNotes(notesData);
        setTemplates(templatesData);
      } catch (error) {
        console.error('Failed to load notes data:', error);
        showError('Failed to load notes');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [open, activeTaskId, activeSessionId, activeTimerInstanceId, showError]);

  // Save note handler
  const handleSaveNote = useCallback(async (noteData: Partial<Note>) => {
    try {
      const note: Note = {
        id: editingNote?.id || `note-${Date.now()}`,
        content: noteData.content!,
        type: noteData.type!,
        taskId: noteData.taskId,
        sessionId: noteData.sessionId,
        timerInstanceId: noteData.timerInstanceId,
        templateId: noteData.templateId,
        tags: noteData.tags || [],
        createdAt: editingNote?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: noteData.metadata,
      };

      await invoke('save_note', { note });

      // Update local state
      setNotes(prev => {
        if (editingNote) {
          return prev.map(n => n.id === note.id ? note : n);
        } else {
          return [...prev, note];
        }
      });

      setShowEditor(false);
      setEditingNote(null);
      showSuccess('Note saved successfully');

    } catch (error) {
      console.error('Failed to save note:', error);
      showError('Failed to save note');
    }
  }, [editingNote, showError, showSuccess]);

  // Delete note handler
  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await invoke('delete_note', { noteId });
      setNotes(prev => prev.filter(n => n.id !== noteId));
      showSuccess('Note deleted successfully');
    } catch (error) {
      console.error('Failed to delete note:', error);
      showError('Failed to delete note');
    }
  }, [showError, showSuccess]);

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
  const getAvailableTypes = (): Note['type'][] => {
    const types: Note['type'][] = [];
    
    if (activeTaskId) types.push('task');
    if (activeSessionId) types.push('session');
    if (activeTimerInstanceId) types.push('timer');
    
    return types;
  };

  const availableTypes = getAvailableTypes();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh' }
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
                disabled={showEditor}
              >
                Add {noteTypeConfig[activeTab].label}
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {noteTypeConfig[activeTab].description}
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
                  templates={templates}
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