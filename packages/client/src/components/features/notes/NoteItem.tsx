/**
 * One note in a notes list: its task, template and links as chips, when it
 * changed, a preview, and (expanded) every filled-in field.
 */

import { useState, MouseEvent, ReactElement } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  IconButton,
  ListItem,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Archive as ArchiveIcon,
  Assignment as TaskIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  FolderOpen as SessionIcon,
  MoreVert as MoreIcon,
  Schedule as TimeIcon,
  Timer as TimerIcon,
  Unarchive as UnarchiveIcon,
} from '@mui/icons-material';
import { TaskNote } from '../../../types/notes';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { createTextPreview, formatMultilineText } from '../../../utils/formatters';
import { formatRelativeDate } from '../../../utils/dateHelpers';
import { noteText } from '../../../utils/notes';

export type NoteLevel = NonNullable<TaskNote['noteLevel']>;

export const NOTE_LEVELS: Record<
  NoteLevel,
  { icon: ReactElement; label: string; color: 'success' | 'primary' | 'secondary'; description: string }
> = {
  task: { icon: <TaskIcon />, label: 'Task', color: 'success', description: 'Notes related to the entire task' },
  session: {
    icon: <SessionIcon />,
    label: 'Session',
    color: 'primary',
    description: 'Notes for a specific work session',
  },
  timer: {
    icon: <TimerIcon />,
    label: 'Timer',
    color: 'secondary',
    description: 'Notes for a specific timer instance',
  },
};

const isFilled = (value: unknown) => value !== undefined && value !== null && value !== '';

function preview(note: TaskNote): string {
  const text = noteText(note);
  if (text) return createTextPreview(text, 100);
  // Only checkboxes filled in
  const checkbox = Object.values(note.fieldValues).find(value => typeof value === 'boolean');
  if (typeof checkbox === 'boolean') return checkbox ? '✓ Checked' : '✗ Unchecked';
  return 'No content';
}

function FieldValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean') {
    return (
      <Typography
        variant="body2"
        sx={{ ml: 1, fontWeight: 'medium', color: value ? 'success.main' : 'text.secondary' }}
      >
        {value ? '✓ Yes' : '✗ No'}
      </Typography>
    );
  }
  const structured = typeof value === 'object';
  return (
    <Typography
      variant="body2"
      sx={{
        ml: 1,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        lineHeight: 1.5,
        ...(structured && { fontFamily: 'monospace', bgcolor: 'action.selected', p: 1, borderRadius: 1 }),
      }}
    >
      {structured ? JSON.stringify(value, null, 2) : formatMultilineText(String(value))}
    </Typography>
  );
}

export interface NoteItemProps {
  note: TaskNote;
  /** Shown as a chip when notes from several tasks are listed together. */
  taskName?: string;
  onEdit: (note: TaskNote) => void;
  onDelete: (noteId: string) => void;
  onArchive: (noteId: string) => void;
  onUnarchive: (noteId: string) => void;
  showLevelIndicator?: boolean;
}

export function NoteItem({
  note,
  taskName,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  showLevelIndicator = true,
}: NoteItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { getTemplateById } = useNoteTemplates();
  const template = getTemplateById(note.templateId);

  const closeMenu = () => setMenuAnchor(null);
  const run = (action: () => void) => () => {
    action();
    closeMenu();
  };
  const fieldLabel = (fieldId: string) => template?.fields.find(field => field.id === fieldId)?.label ?? fieldId;
  const filledCount = Object.values(note.fieldValues).filter(isFilled).length;
  const level = showLevelIndicator && note.noteLevel ? NOTE_LEVELS[note.noteLevel] : undefined;

  return (
    <Paper variant="outlined" sx={{ mb: 1 }}>
      <ListItem
        component="div"
        onClick={() => setExpanded(open => !open)}
        sx={{ '&:hover': { bgcolor: 'action.hover' }, cursor: 'pointer', pr: 12 }}
        secondaryAction={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
              <IconButton
                size="small"
                aria-label={expanded ? 'Collapse note' : 'Expand note'}
                aria-expanded={expanded}
                onClick={(event: MouseEvent<HTMLElement>) => {
                  // The row toggles too: one toggle, not two
                  event.stopPropagation();
                  setExpanded(open => !open);
                }}
              >
                {expanded ? <CollapseIcon /> : <ExpandIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="More actions">
              <IconButton
                size="small"
                aria-label="More actions"
                onClick={(event: MouseEvent<HTMLElement>) => {
                  event.stopPropagation();
                  setMenuAnchor(event.currentTarget);
                }}
              >
                <MoreIcon />
              </IconButton>
            </Tooltip>
          </Box>
        }
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            {taskName && <Chip icon={<TaskIcon />} label={taskName} size="small" color="success" variant="outlined" />}
            <Chip label={note.templateName} size="small" color="primary" variant="outlined" />
            <Chip label={`${filledCount} fields`} size="small" variant="outlined" />
            {level && (
              <Chip icon={level.icon} label={level.label} size="small" color={level.color} variant="outlined" />
            )}
            {note.timeEntryId && <Chip label="Time Entry" size="small" color="secondary" variant="outlined" />}
            {note.sessionId && <Chip label="Session" size="small" color="info" variant="outlined" />}
            {note.timerInstanceId && <Chip label="Timer Instance" size="small" color="warning" variant="outlined" />}
            {note.isArchived && <Chip label="Archived" size="small" color="warning" variant="outlined" />}
          </Box>
          <Stack spacing={0.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TimeIcon fontSize="small" color="action" />
              <Typography variant="caption" color="text.secondary">
                {formatRelativeDate(note.updatedAt)}
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
                lineHeight: 1.4,
              }}
            >
              {preview(note)}
            </Typography>
          </Stack>
        </Box>
      </ListItem>

      <Collapse in={expanded}>
        <Box sx={{ p: 2, pt: 0, bgcolor: 'action.hover' }}>
          <Stack spacing={2}>
            {Object.entries(note.fieldValues)
              .filter(([, value]) => isFilled(value))
              .map(([fieldId, value]) => (
                <Box key={fieldId}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 'medium', mb: 0.5, display: 'block' }}
                  >
                    {fieldLabel(fieldId)}:
                  </Typography>
                  <FieldValue value={value} />
                </Box>
              ))}

            <Divider sx={{ my: 1 }} />

            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
            >
              <Typography variant="caption" color="text.secondary">
                Created: {formatRelativeDate(note.createdAt)}
                {note.createdAt !== note.updatedAt && <> • Updated: {formatRelativeDate(note.updatedAt)}</>}
              </Typography>
              <Box>
                <Button size="small" startIcon={<EditIcon />} onClick={() => onEdit(note)}>
                  Edit
                </Button>
                <Button size="small" startIcon={<DeleteIcon />} onClick={() => onDelete(note.id)} color="error">
                  Delete
                </Button>
              </Box>
            </Box>
          </Stack>
        </Box>
      </Collapse>

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={closeMenu}>
        <MenuItem onClick={run(() => onEdit(note))}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit Note
        </MenuItem>
        {note.isArchived ? (
          <MenuItem onClick={run(() => onUnarchive(note.id))}>
            <UnarchiveIcon fontSize="small" sx={{ mr: 1 }} />
            Unarchive Note
          </MenuItem>
        ) : (
          <MenuItem onClick={run(() => onArchive(note.id))}>
            <ArchiveIcon fontSize="small" sx={{ mr: 1 }} />
            Archive Note
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={run(() => onDelete(note.id))} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Note
        </MenuItem>
      </Menu>
    </Paper>
  );
}
