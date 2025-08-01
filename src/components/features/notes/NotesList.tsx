/**
 * Notes List Component
 * 
 * Displays a list of saved notes for a task with creation date,
 * edit/delete actions, and note preview functionality.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Button,
  Stack,
  Collapse,

  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  MoreVert as MoreIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Notes as NotesIcon,
  Schedule as TimeIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  Assignment as TaskIcon,
  FolderOpen as SessionIcon,
  Timer as TimerIcon,
  AccountTree as HierarchyIcon,
} from '@mui/icons-material';
import { NotesListProps, TaskNote } from '../../../types/notes';
import { ConfirmDialog } from '../../ui';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { createTextPreview, formatMultilineText } from '../../../utils/formatters';
import { formatRelativeDate } from '../../../utils/dateHelpers';

// Note level configuration for hierarchical display
const noteLevelConfig = {
  task: {
    icon: <TaskIcon />,
    label: 'Task',
    color: 'success' as const,
    description: 'Notes related to the entire task',
    priority: 1,
  },
  session: {
    icon: <SessionIcon />,
    label: 'Session',
    color: 'primary' as const,
    description: 'Notes for a specific work session',
    priority: 2,
  },
  timer: {
    icon: <TimerIcon />,
    label: 'Timer',
    color: 'secondary' as const,
    description: 'Notes for a specific timer instance',
    priority: 3,
  },
};

// Hierarchical grouping component
interface HierarchicalNotesViewProps {
  notes: TaskNote[];
  onEditNote: (note: TaskNote) => void;
  onDeleteNote: (noteId: string) => void;
  onArchiveNote: (noteId: string) => void;
  onUnarchiveNote: (noteId: string) => void;
}

function HierarchicalNotesView({
  notes,
  onEditNote,
  onDeleteNote,
  onArchiveNote,
  onUnarchiveNote,
}: HierarchicalNotesViewProps) {
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(['task', 'session', 'timer']));

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(level)) {
        newSet.delete(level);
      } else {
        newSet.add(level);
      }
      return newSet;
    });
  };

  // Group notes by level
  const notesByLevel = useMemo(() => {
    const grouped = notes.reduce((acc, note) => {
      const level = note.noteLevel || 'task';
      if (!acc[level]) {
        acc[level] = [];
      }
      acc[level].push(note);
      return acc;
    }, {} as Record<string, TaskNote[]>);

    // Sort each level by creation date (newest first)
    Object.keys(grouped).forEach(level => {
      grouped[level].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    return grouped;
  }, [notes]);

  // Sort levels by priority
  const sortedLevels = Object.keys(notesByLevel).sort((a, b) => {
    const priorityA = noteLevelConfig[a as keyof typeof noteLevelConfig]?.priority || 999;
    const priorityB = noteLevelConfig[b as keyof typeof noteLevelConfig]?.priority || 999;
    return priorityA - priorityB;
  });

  return (
    <Box>
      {sortedLevels.map(level => {
        const levelNotes = notesByLevel[level];
        const config = noteLevelConfig[level as keyof typeof noteLevelConfig];
        const isExpanded = expandedLevels.has(level);

        return (
          <Box key={level} sx={{ mb: 2 }}>
            {/* Level Header */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                p: 1,
                bgcolor: 'grey.50',
                borderRadius: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'grey.100' },
              }}
              onClick={() => toggleLevel(level)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <Box sx={{ color: `${config?.color}.main`, mr: 1 }}>
                  {config?.icon}
                </Box>
                <Typography variant="subtitle2" fontWeight="medium">
                  {config?.label} Notes ({levelNotes.length})
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {config?.description}
                </Typography>
              </Box>
              <IconButton size="small">
                {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
              </IconButton>
            </Box>

            {/* Level Notes */}
            {isExpanded && (
              <Box sx={{ ml: 2, mt: 1 }}>
                {levelNotes.map((note: TaskNote) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    onEdit={onEditNote}
                    onDelete={onDeleteNote}
                    onArchive={onArchiveNote}
                    onUnarchive={onUnarchiveNote}
                    showLevelIndicator={false} // Don't show level indicator in hierarchical view
                  />
                ))}
                {levelNotes.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
                    No {level} notes yet
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

interface NoteItemProps {
  note: TaskNote;
  onEdit: (note: TaskNote) => void;
  onDelete: (noteId: string) => void;
  onArchive?: (noteId: string) => void;
  onUnarchive?: (noteId: string) => void;
  showLevelIndicator?: boolean;
}

function NoteItem({ note, onEdit, onDelete, onArchive, onUnarchive, showLevelIndicator = true }: NoteItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Get template to resolve field labels
  const { getTemplateById } = useNoteTemplates();
  const template = getTemplateById(note.templateId);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const handleEdit = useCallback(() => {
    onEdit(note);
    handleMenuClose();
  }, [note, onEdit, handleMenuClose]);

  const handleDelete = useCallback(() => {
    onDelete(note.id);
    handleMenuClose();
  }, [note.id, onDelete, handleMenuClose]);

  const handleArchive = useCallback(() => {
    if (onArchive) {
      onArchive(note.id);
    }
    handleMenuClose();
  }, [note.id, onArchive, handleMenuClose]);

  const handleUnarchive = useCallback(() => {
    if (onUnarchive) {
      onUnarchive(note.id);
    }
    handleMenuClose();
  }, [note.id, onUnarchive, handleMenuClose]);

  const formatDate = useCallback((dateString: string) => {
    return formatRelativeDate(dateString);
  }, []);

  const getFieldPreview = useCallback(() => {
    const values = Object.values(note.fieldValues).filter(value =>
      value !== undefined && value !== null && value !== ''
    );

    if (values.length === 0) return 'No content';

    // Show first non-empty value as preview
    const firstValue = values[0];

    // Handle different field types
    if (typeof firstValue === 'boolean') {
      return firstValue ? '✓ Checked' : '✗ Unchecked';
    }

    if (typeof firstValue === 'string') {
      return createTextPreview(firstValue, 100);
    }

    return String(firstValue);
  }, [note.fieldValues]);

  const getFilledFieldsCount = useCallback(() => {
    return Object.values(note.fieldValues).filter(value =>
      value !== undefined && value !== null && value !== ''
    ).length;
  }, [note.fieldValues]);

  const getFieldLabel = useCallback((fieldId: string): string => {
    if (!template) return fieldId;
    const field = template.fields.find(f => f.id === fieldId);
    return field ? field.label : fieldId;
  }, [template]);

  return (
    <Paper variant="outlined" sx={{ mb: 1 }}>
      <ListItem
        component="div"
        onClick={() => setExpanded(!expanded)}
        sx={{
          '&:hover': { bgcolor: 'action.hover' },
          cursor: 'pointer',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Primary content - chips */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Chip
              label={note.templateName}
              size="small"
              color="primary"
              variant="outlined"
            />
            <Chip
              label={`${getFilledFieldsCount()} fields`}
              size="small"
              variant="outlined"
            />
            {showLevelIndicator && note.noteLevel && (
              <Chip
                icon={noteLevelConfig[note.noteLevel]?.icon}
                label={noteLevelConfig[note.noteLevel]?.label}
                size="small"
                color={noteLevelConfig[note.noteLevel]?.color}
                variant="outlined"
              />
            )}
            {note.timeEntryId && (
              <Chip
                label="Time Entry"
                size="small"
                color="secondary"
                variant="outlined"
              />
            )}
            {note.sessionId && (
              <Chip
                label="Session"
                size="small"
                color="info"
                variant="outlined"
              />
            )}
            {note.timerInstanceId && (
              <Chip
                label="Timer Instance"
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
            {note.isArchived && (
              <Chip
                label="Archived"
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
          </Box>

          {/* Secondary content - date and preview */}
          <Stack spacing={0.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TimeIcon fontSize="small" color="action" />
              <Typography variant="caption" color="text.secondary">
                {formatDate(note.updatedAt)}
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.4,
                maxHeight: '2.8em', // 2 lines * 1.4 line-height
              }}
            >
              {getFieldPreview()}
            </Typography>
          </Stack>
        </Box>
        <ListItemSecondaryAction>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              title="More actions"
            >
              <MoreIcon />
            </IconButton>
          </Box>
        </ListItemSecondaryAction>
      </ListItem>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2, pt: 0, bgcolor: 'action.hover' }}>
          <Stack spacing={2}>
            {Object.entries(note.fieldValues).map(([fieldId, value]) => {
              if (value === undefined || value === null || value === '') return null;

              const fieldLabel = getFieldLabel(fieldId);

              // Handle different field types for display
              let displayValue: string;
              let displayStyle = {};

              if (typeof value === 'boolean') {
                displayValue = value ? '✓ Yes' : '✗ No';
                displayStyle = {
                  color: value ? 'success.main' : 'text.secondary',
                  fontWeight: 'medium'
                };
              } else if (typeof value === 'object') {
                displayValue = JSON.stringify(value, null, 2);
                displayStyle = {
                  fontFamily: 'monospace',
                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                  padding: 1,
                  borderRadius: 1,
                };
              } else {
                displayValue = formatMultilineText(String(value));
              }

              return (
                <Box key={fieldId}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                    {fieldLabel}:
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      ml: 1,
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      lineHeight: 1.5,
                      ...displayStyle,
                    }}
                  >
                    {displayValue}
                  </Typography>
                </Box>
              );
            })}
            
            <Divider sx={{ my: 1 }} />
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Created: {formatDate(note.createdAt)}
                {note.createdAt !== note.updatedAt && (
                  <> • Updated: {formatDate(note.updatedAt)}</>
                )}
                {note.timeEntryId && (
                  <> • Linked to Time Entry: {note.timeEntryId}</>
                )}
              </Typography>
              <Box>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={handleEdit}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={handleDelete}
                  color="error"
                >
                  Delete
                </Button>
              </Box>
            </Box>
          </Stack>
        </Box>
      </Collapse>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEdit}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit Note
        </MenuItem>
        {note.isArchived ? (
          onUnarchive && (
            <MenuItem onClick={handleUnarchive}>
              <UnarchiveIcon fontSize="small" sx={{ mr: 1 }} />
              Unarchive Note
            </MenuItem>
          )
        ) : (
          onArchive && (
            <MenuItem onClick={handleArchive}>
              <ArchiveIcon fontSize="small" sx={{ mr: 1 }} />
              Archive Note
            </MenuItem>
          )
        )}
        <Divider />
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Note
        </MenuItem>
      </Menu>
    </Paper>
  );
}

export function NotesList({
  notes,
  onEditNote,
  onDeleteNote,
  onCreateNote,
  onArchiveNote,
  onUnarchiveNote,
}: NotesListProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'flat' | 'hierarchical'>('hierarchical');

  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await onDeleteNote(noteId);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
    setDeleteConfirm(null);
  }, [onDeleteNote]);

  const sortedNotes = [...notes].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  if (sortedNotes.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <NotesIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Notes Yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Start by creating your first note for this task.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateNote}
        >
          Create First Note
        </Button>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">
            Notes ({sortedNotes.length})
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              View:
            </Typography>
            <Button
              size="small"
              variant={viewMode === 'hierarchical' ? 'contained' : 'outlined'}
              startIcon={<HierarchyIcon />}
              onClick={() => setViewMode('hierarchical')}
              sx={{ minWidth: 'auto' }}
            >
              Hierarchical
            </Button>
            <Button
              size="small"
              variant={viewMode === 'flat' ? 'contained' : 'outlined'}
              startIcon={<NotesIcon />}
              onClick={() => setViewMode('flat')}
              sx={{ minWidth: 'auto' }}
            >
              Flat
            </Button>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateNote}
          size="small"
        >
          Add Note
        </Button>
      </Box>

      {/* Notes Display */}
      {viewMode === 'hierarchical' ? (
        <HierarchicalNotesView
          notes={sortedNotes}
          onEditNote={onEditNote}
          onDeleteNote={(noteId) => setDeleteConfirm(noteId)}
          onArchiveNote={onArchiveNote || (() => {})}
          onUnarchiveNote={onUnarchiveNote || (() => {})}
        />
      ) : (
        <List sx={{ p: 0 }}>
          {sortedNotes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onEdit={onEditNote}
              onDelete={(noteId) => setDeleteConfirm(noteId)}
              onArchive={onArchiveNote}
              onUnarchive={onUnarchiveNote}
              showLevelIndicator={true}
            />
          ))}
        </List>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteNote(deleteConfirm)}
        title="Delete Note"
        message="Are you sure you want to delete this note? This action cannot be undone."
        confirmLabel="Delete"
        severity="error"
      />
    </Box>
  );
}
