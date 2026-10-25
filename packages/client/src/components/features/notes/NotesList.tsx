/**
 * Notes List
 *
 * The notes it's given, most recently changed first: grouped by level (task,
 * session, timer) or as one flat list. Searching and filtering are the
 * caller's (the Notes page has them in its header); so is adding, except
 * where the list is the only place to add from (onCreateNote).
 */

import { useMemo, useState } from 'react';
import { Box, Button, IconButton, List, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import {
  AccountTree as HierarchyIcon,
  Add as AddIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import { NotesListProps, TaskNote } from '../../../types/notes';
import { NOTE_LEVELS, NoteItem, NoteLevel } from './NoteItem';

const LEVEL_ORDER: NoteLevel[] = ['task', 'session', 'timer'];

type ItemHandlers = Pick<NotesListProps, 'taskNames' | 'onEditNote' | 'onDeleteNote' | 'onArchiveNote' | 'onUnarchiveNote'>;

function NoteItems({ notes, showLevelIndicator, ...handlers }: ItemHandlers & { notes: TaskNote[]; showLevelIndicator: boolean }) {
  return (
    <List disablePadding>
      {notes.map(note => (
        <NoteItem
          key={note.id}
          note={note}
          taskName={handlers.taskNames?.[note.taskId]}
          onEdit={handlers.onEditNote}
          onDelete={handlers.onDeleteNote}
          onArchive={handlers.onArchiveNote}
          onUnarchive={handlers.onUnarchiveNote}
          showLevelIndicator={showLevelIndicator}
        />
      ))}
    </List>
  );
}

function NotesByLevel({ notes, ...handlers }: ItemHandlers & { notes: TaskNote[] }) {
  const [collapsed, setCollapsed] = useState<Set<NoteLevel>>(new Set());
  const groups = useMemo(
    () =>
      LEVEL_ORDER.map(level => ({ level, notes: notes.filter(note => (note.noteLevel ?? 'task') === level) })).filter(
        group => group.notes.length > 0
      ),
    [notes]
  );
  const toggle = (level: NoteLevel) =>
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });

  return (
    <Box>
      {groups.map(({ level, notes: levelNotes }) => {
        const config = NOTE_LEVELS[level];
        const open = !collapsed.has(level);
        return (
          <Box key={level} sx={{ mb: 2 }}>
            <Box
              onClick={() => toggle(level)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.selected' },
              }}
            >
              <Box sx={{ color: `${config.color}.main`, mr: 1, display: 'flex' }}>{config.icon}</Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                {config.label} Notes ({levelNotes.length})
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flex: 1 }}>
                {config.description}
              </Typography>
              <IconButton size="small" aria-label={open ? 'Collapse notes' : 'Expand notes'} aria-expanded={open}>
                {open ? <CollapseIcon /> : <ExpandIcon />}
              </IconButton>
            </Box>
            {open && (
              <Box sx={{ ml: 2, mt: 1 }}>
                <NoteItems notes={levelNotes} showLevelIndicator={false} {...handlers} />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export function NotesList({ notes, title = 'Notes', onCreateNote, ...handlers }: NotesListProps) {
  const [viewMode, setViewMode] = useState<'hierarchical' | 'flat'>('hierarchical');

  // The one sort: most recently changed first
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [notes]
  );

  if (sortedNotes.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <NotesIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No notes yet
        </Typography>
        {onCreateNote && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={onCreateNote} sx={{ mt: 1 }}>
            Add Note
          </Button>
        )}
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {title} ({sortedNotes.length})
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, mode: 'hierarchical' | 'flat' | null) => mode && setViewMode(mode)}
          aria-label="Group notes"
        >
          <ToggleButton value="hierarchical">
            <HierarchyIcon fontSize="small" sx={{ mr: 0.5 }} />
            By level
          </ToggleButton>
          <ToggleButton value="flat">
            <NotesIcon fontSize="small" sx={{ mr: 0.5 }} />
            All
          </ToggleButton>
        </ToggleButtonGroup>
        {onCreateNote && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onCreateNote}>
            Add Note
          </Button>
        )}
      </Box>

      {viewMode === 'hierarchical' ? (
        <NotesByLevel notes={sortedNotes} {...handlers} />
      ) : (
        <NoteItems notes={sortedNotes} showLevelIndicator {...handlers} />
      )}
    </Box>
  );
}
