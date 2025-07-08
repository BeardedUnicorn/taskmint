/**
 * Notes Page Component
 *
 * A dedicated page for managing all notes across tasks. This page provides:
 * - A list of all notes from all tasks
 * - Ability to create new notes
 * - If there's an active timer, new notes default to the active task and use its default template
 * - Search and filter functionality
 * - Note editing and deletion
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Chip,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Notes as NotesIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';
import { TaskNote, NoteTemplate } from '../../types/notes';
import { NotesList, NoteEditor } from '../features/notes';
import { useTaskNotes } from '../../hooks/useTaskNotes';
import { useNoteTemplates } from '../../hooks/useNoteTemplates';

interface NotesPageProps {
  tasks: Task[];
  activeEntry: TimeEntry | null;
}

export function NotesPage({ tasks, activeEntry }: NotesPageProps) {
  // State for note management
  const [editingNote, setEditingNote] = useState<TaskNote | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [isCreatingNewNote, setIsCreatingNewNote] = useState(false);

  // State for filtering and search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string>('all');
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState<string>('all');

  // Hooks for notes (get all notes across all tasks)
  const {
    notes,
    createNote,
    updateNote,
    deleteNote,
    searchNotes,
    sortNotes,
  } = useTaskNotes() as any; // Type assertion for extended methods

  // Hooks for templates
  const { templates } = useNoteTemplates();

  // Filter and search notes
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = searchNotes(searchQuery);
    }

    // Apply task filter
    if (selectedTaskFilter !== 'all') {
      filtered = filtered.filter((note: TaskNote) => note.taskId === selectedTaskFilter);
    }

    // Apply template filter
    if (selectedTemplateFilter !== 'all') {
      filtered = filtered.filter((note: TaskNote) => note.templateId === selectedTemplateFilter);
    }

    // Sort by most recent first - create a new array and sort it
    const sorted = [...filtered].sort((a: TaskNote, b: TaskNote) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return sorted;
  }, [notes, searchQuery, selectedTaskFilter, selectedTemplateFilter, searchNotes]);

  // Get unique templates used in notes for filter dropdown
  const usedTemplates = useMemo(() => {
    const templateIds = [...new Set(notes.map((note: TaskNote) => note.templateId))];
    return templates.filter(template => templateIds.includes(template.id));
  }, [notes, templates]);

  // Reset editor state when switching between notes
  useEffect(() => {
    if (!isCreatingNewNote) {
      setEditingNote(null);
      setSelectedTemplate(null);
    }
  }, [isCreatingNewNote]);

  // Handlers
  const handleDeleteNote = async (noteId: string): Promise<void> => {
    await deleteNote(noteId);
    if (editingNote?.id === noteId) {
      setEditingNote(null);
      setSelectedTemplate(null);
      setIsCreatingNewNote(false);
    }
  };

  const handleEditNote = (note: TaskNote) => {
    setEditingNote(note);
    // Find the template for this note
    const template = templates.find(t => t.id === note.templateId);
    setSelectedTemplate(template || null);
    setIsEditorCollapsed(false);
    setIsCreatingNewNote(false);
  };

  const handleCreateNote = () => {
    setEditingNote(null);
    setIsCreatingNewNote(true);
    
    // If there's an active timer, use the active task and its default template
    if (activeEntry) {
      const activeTask = tasks.find(task => task.name === activeEntry.taskName);
      if (activeTask?.defaultNoteTemplateId) {
        const defaultTemplate = templates.find(t => t.id === activeTask.defaultNoteTemplateId);
        setSelectedTemplate(defaultTemplate || null);
      } else {
        setSelectedTemplate(null);
      }
    } else {
      setSelectedTemplate(null);
    }
    
    setIsEditorCollapsed(false);
  };

  const handleSaveNote = async (noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskNote> => {
    const savedNote = await createNote(noteData);
    setEditingNote(null);
    setSelectedTemplate(null);
    setIsCreatingNewNote(false);
    return savedNote;
  };

  const handleUpdateNote = async (noteId: string, updates: Partial<TaskNote>): Promise<TaskNote> => {
    const updatedNote = await updateNote(noteId, updates);
    setEditingNote(null);
    setSelectedTemplate(null);
    setIsCreatingNewNote(false);
    return updatedNote;
  };

  const handleToggleEditor = () => {
    setIsEditorCollapsed(!isEditorCollapsed);
  };

  const handleCloseEditor = () => {
    setEditingNote(null);
    setSelectedTemplate(null);
    setIsCreatingNewNote(false);
  };

  // Get the task ID for new notes (prefer active timer task)
  const getDefaultTaskId = (): string => {
    if (activeEntry) {
      const activeTask = tasks.find(task => task.name === activeEntry.taskName);
      if (activeTask) {
        return activeTask.id;
      }
    }
    // Fallback to first task if no active timer
    return tasks.length > 0 ? tasks[0].id : '';
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Page Header */}
      <Box sx={{ p: 3, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <NotesIcon color="primary" />
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Notes
          </Typography>
          <Chip
            label={`${filteredNotes.length} notes`}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>
        <Typography variant="body1" color="text.secondary">
          Manage all your notes across tasks in one place
        </Typography>
      </Box>

      {/* Active Timer Info */}
      {activeEntry && (
        <Box sx={{ px: 3, pb: 2 }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            <Typography variant="body2">
              <strong>Active Timer:</strong> {activeEntry.taskName}
              {(() => {
                const activeTask = tasks.find(task => task.name === activeEntry.taskName);
                const defaultTemplate = activeTask?.defaultNoteTemplateId 
                  ? templates.find(t => t.id === activeTask.defaultNoteTemplateId)
                  : null;
                return defaultTemplate 
                  ? ` • New notes will use "${defaultTemplate.name}" template`
                  : ' • No default template set';
              })()}
            </Typography>
          </Alert>
        </Box>
      )}

      {/* Controls */}
      <Box sx={{ px: 3, pb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          {/* Search */}
          <TextField
            size="small"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 250 }}
          />

          {/* Task Filter */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Filter by Task</InputLabel>
            <Select
              value={selectedTaskFilter}
              label="Filter by Task"
              onChange={(e) => setSelectedTaskFilter(e.target.value)}
            >
              <MenuItem value="all">All Tasks</MenuItem>
              {tasks.map((task) => (
                <MenuItem key={task.id} value={task.id}>
                  {task.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Template Filter */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Filter by Template</InputLabel>
            <Select
              value={selectedTemplateFilter}
              label="Filter by Template"
              onChange={(e) => setSelectedTemplateFilter(e.target.value)}
            >
              <MenuItem value="all">All Templates</MenuItem>
              {usedTemplates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Add Note Button */}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateNote}
            disabled={tasks.length === 0}
          >
            Add Note
          </Button>
        </Stack>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'hidden', px: 3, pb: 3 }}>
        <Paper
          elevation={1}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
            {/* Note Editor - Show when editing or creating */}
            {(editingNote || selectedTemplate || isCreatingNewNote) && (
              <Box sx={{ mb: 3 }}>
                <NoteEditor
                  taskId={editingNote?.taskId || getDefaultTaskId()}
                  template={selectedTemplate}
                  existingNote={editingNote}
                  onSaveNote={handleSaveNote}
                  onUpdateNote={handleUpdateNote}
                  onDeleteNote={handleDeleteNote}
                  isCollapsed={isEditorCollapsed}
                  onToggleCollapse={handleToggleEditor}
                  onCloseEditor={handleCloseEditor}
                />
              </Box>
            )}

            {/* Notes List */}
            {tasks.length === 0 ? (
              <Alert severity="info" sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  No Tasks Available
                </Typography>
                <Typography variant="body2">
                  Create some tasks first to start adding notes.
                </Typography>
              </Alert>
            ) : filteredNotes.length === 0 ? (
              <Alert severity="info" sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  No Notes Found
                </Typography>
                <Typography variant="body2">
                  {searchQuery || selectedTaskFilter !== 'all' || selectedTemplateFilter !== 'all'
                    ? 'No notes match your current filters. Try adjusting your search or filters.'
                    : 'Start by creating your first note using the "Add Note" button above.'}
                </Typography>
              </Alert>
            ) : (
              <NotesList
                taskId="" // Empty string since we're showing notes from all tasks
                notes={filteredNotes}
                onEditNote={handleEditNote}
                onDeleteNote={handleDeleteNote}
                onCreateNote={handleCreateNote}
              />
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
