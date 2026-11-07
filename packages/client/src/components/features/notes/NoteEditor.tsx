/**
 * Note Editor
 *
 * Creates or edits a note: free-form text, or the fields of a template. The
 * draft saves itself a second after you stop typing (useNoteDraft); Save
 * saves and closes. A new note can switch templates until it's first saved.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Clear as ClearIcon,
  ContentCopy as CopyIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  Notes as NotesIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { NoteEditorProps, NoteTemplate, TaskNote } from '../../../types/notes';
import { useNotification } from '../../../contexts/NotificationContext';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { NoteDraft, SaveStatus, useNoteDraft } from '../../../hooks/useNoteDraft';
import { FREE_FORM_TEMPLATE_ID, FREE_FORM_TEMPLATE_NAME } from '../../../utils/notes';
import { FREE_FORM_CONTENT, FieldValues, emptyValues, isEmptyDraft, orderedFields } from '../../../utils/noteFields';
import { ConfirmDialog } from '../../ui';
import { NoteFieldInput } from './NoteFieldInput';
import { formatClockTime } from '../../../utils/locale';

const isFilled = (value: unknown) => value !== undefined && value !== null && value !== '' && value !== false;

function SaveStatusText({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const text = (() => {
    switch (status.state) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return `Saved · ${formatClockTime(status.at)}`;
      case 'dirty':
        return 'Unsaved changes';
      case 'error':
        return "Couldn't save";
      default:
        return '';
    }
  })();
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', minHeight: 32 }}
    >
      <Typography variant="body2" color={status.state === 'error' ? 'error' : 'text.secondary'}>
        {text}
      </Typography>
      {status.state === 'error' && (
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}

/** A free-form note's text (none yet when it was a template note until now). */
const freeFormText = (values: FieldValues) => String(values[FREE_FORM_CONTENT] ?? '');

function summaryText(template: NoteTemplate | null, values: FieldValues): string {
  if (!template) {
    const length = freeFormText(values).length;
    return length > 0 ? `${length} characters` : 'Empty note';
  }
  const filled = template.fields.filter(field => isFilled(values[field.id])).length;
  return `${filled}/${template.fields.length} fields completed`;
}

export function NoteEditor({
  taskId,
  template: initialTemplate,
  existingNote,
  timeEntryId,
  sessionId,
  timerInstanceId,
  noteLevel = 'task',
  onSaveNote,
  onUpdateNote,
  onDeleteNote,
  isCollapsed,
  onToggleCollapse,
  onCloseEditor,
  autoSaveDisabled = false,
  tasks,
}: NoteEditorProps) {
  // New notes pick from the active templates (the built-in free-form one isn't)
  const { getActiveTemplates } = useNoteTemplates();
  const templates = getActiveTemplates();
  const { showSuccess, showError, showInfo } = useNotification();
  // The built-in free-form template has no fields: its notes are plain text
  const [template, setTemplate] = useState<NoteTemplate | null>(() =>
    initialTemplate?.id === FREE_FORM_TEMPLATE_ID ? null : initialTemplate
  );
  // The note's task: chosen in the picker when `tasks` is given, else the prop
  const [selectedTaskId, setSelectedTaskId] = useState(existingNote?.taskId ?? taskId);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Content and task only on an update: a note keeps its own session/timer
  // link wherever it's edited from.
  const persist = useCallback(
    (values: FieldValues, note: TaskNote | null): Promise<TaskNote> => {
      if (note) return onUpdateNote(note.id, { fieldValues: values, taskId: selectedTaskId });
      return onSaveNote({
        taskId: selectedTaskId,
        templateId: template ? template.id : FREE_FORM_TEMPLATE_ID,
        templateName: template ? template.name : FREE_FORM_TEMPLATE_NAME,
        fieldValues: template ? values : { [FREE_FORM_CONTENT]: freeFormText(values) },
        timeEntryId,
        sessionId,
        timerInstanceId,
        noteLevel,
        isArchived: false,
      });
    },
    [onUpdateNote, onSaveNote, selectedTaskId, template, timeEntryId, sessionId, timerInstanceId, noteLevel]
  );

  const draft: NoteDraft = useNoteDraft({
    note: existingNote ?? null,
    template,
    persist,
    autoSave: !autoSaveDisabled,
    onError: message => showError(message, { category: 'note', title: "Couldn't save the note" }),
  });
  const { values, errors, note, status, setField, replaceValues, touch, save } = draft;
  const isSaving = status.state === 'saving';
  const hasErrors = Object.keys(errors).length > 0;

  const handleTaskChange = (nextTaskId: string) => {
    setSelectedTaskId(nextTaskId);
    touch();
  };

  // Only before the first save; switching to free-form keeps any text
  const handleTemplateChange = (templateId: string) => {
    const next = templates.find(t => t.id === templateId) ?? null;
    setTemplate(next);
    replaceValues(next ? emptyValues(next.fields) : { [FREE_FORM_CONTENT]: freeFormText(values) });
  };

  const handleSave = async () => {
    const result = await save();
    if (result === 'saved' || result === 'empty') onCloseEditor?.();
  };

  // Clear offers Undo, which puts back what was there
  const handleClear = () => {
    const previous = values;
    replaceValues(emptyValues(template?.fields));
    if (!isEmptyDraft(previous)) {
      showInfo('Cleared the note', {
        category: 'note',
        history: false,
        actions: [{ label: 'Undo', onClick: () => replaceValues(previous) }],
      });
    }
  };

  // Changes to a saved note are saved on the way out; a new note's are
  // only kept if you say so
  const handleClose = async () => {
    if (!draft.dirty || (!note && isEmptyDraft(values))) {
      onCloseEditor?.();
      return;
    }
    if (note && (await save()) === 'saved') {
      onCloseEditor?.();
      return;
    }
    setShowDiscardDialog(true);
  };

  const handleCopy = useCallback(
    async (fieldId: string, label: string) => {
      const value = values[fieldId];
      if (value === undefined || value === null || value === '') {
        showInfo(`No content to copy from ${label}`, { category: 'note', duration: 2500, history: false });
        return;
      }
      try {
        await navigator.clipboard.writeText(String(value));
        showSuccess(`Copied ${label} to the clipboard`, { category: 'note', duration: 2000, history: false });
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        showError(`Couldn't copy ${label}`, { category: 'note', history: false });
      }
    },
    [values, showInfo, showSuccess, showError]
  );

  const copyButton = (fieldId: string, label: string) => (
    <Tooltip title={`Copy ${label}`}>
      <IconButton
        size="small"
        aria-label={`Copy ${label}`}
        onClick={() => void handleCopy(fieldId, label)}
        sx={{ mt: 1 }}
      >
        <CopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  const fields = useMemo(() => (template ? orderedFields(template.fields) : []), [template]);

  return (
    <>
      <Paper sx={{ mb: 2 }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
          onClick={onToggleCollapse}
        >
          <NotesIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
              {note ? (template?.name ?? 'Free-form note') : 'New note'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {summaryText(template, values)}
            </Typography>
          </Box>
          <IconButton size="small" aria-label={isCollapsed ? 'Expand notes' : 'Collapse notes'}>
            {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
          </IconButton>
        </Box>

        <Collapse in={!isCollapsed}>
          <Stack spacing={2} sx={{ p: 2, pt: 0 }}>
            {tasks && (
              <FormControl fullWidth size="small">
                <InputLabel id="note-task-label">Task</InputLabel>
                <Select
                  labelId="note-task-label"
                  label="Task"
                  value={selectedTaskId}
                  onChange={event => handleTaskChange(event.target.value)}
                >
                  {tasks.map(task => (
                    <MenuItem key={task.id} value={task.id}>
                      {task.name}
                    </MenuItem>
                  ))}
                  {selectedTaskId && !tasks.some(task => task.id === selectedTaskId) && (
                    <MenuItem value={selectedTaskId} disabled>
                      Deleted task
                    </MenuItem>
                  )}
                </Select>
              </FormControl>
            )}

            {!note && (
              <FormControl fullWidth size="small">
                <InputLabel id="note-template-label">Select Template</InputLabel>
                <Select
                  labelId="note-template-label"
                  label="Select Template"
                  value={template?.id ?? ''}
                  onChange={event => handleTemplateChange(event.target.value)}
                >
                  <MenuItem value="">
                    <em>Free-form Note</em>
                  </MenuItem>
                  {templates.map(option => (
                    <MenuItem key={option.id} value={option.id}>
                      {option.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {template?.description && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label={template.name} color="primary" variant="outlined" size="small" />
                <Typography variant="body2" color="text.secondary">
                  {template.description}
                </Typography>
              </Box>
            )}

            {template ? (
              fields.map(field => (
                <Box key={field.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <NoteFieldInput
                      field={field}
                      value={values[field.id]}
                      error={errors[field.id]}
                      onChange={setField}
                    />
                  </Box>
                  {copyButton(field.id, field.label)}
                </Box>
              ))
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <TextField
                  label="Note Content"
                  multiline
                  minRows={4}
                  maxRows={12}
                  fullWidth
                  value={freeFormText(values)}
                  onChange={event => setField(FREE_FORM_CONTENT, event.target.value)}
                  placeholder="Start typing your note here..."
                />
                {copyButton(FREE_FORM_CONTENT, 'Note Content')}
              </Box>
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, pt: 1 }}>
              <Button
                variant="contained"
                startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={() => void handleSave()}
                disabled={isSaving || hasErrors}
              >
                {note ? 'Update Note' : 'Save Note'}
              </Button>
              <Button variant="outlined" startIcon={<ClearIcon />} onClick={handleClear} disabled={isSaving}>
                Clear
              </Button>
              {note && (
                <Button variant="outlined" color="error" onClick={() => void onDeleteNote(note.id)} disabled={isSaving}>
                  Delete Note
                </Button>
              )}
              {onCloseEditor && (
                <Button variant="outlined" onClick={() => void handleClose()} disabled={isSaving}>
                  {note ? 'Close' : 'Cancel'}
                </Button>
              )}
              <SaveStatusText status={status} onRetry={() => void save()} />
            </Box>
          </Stack>
        </Collapse>
      </Paper>
      <ConfirmDialog
        open={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        onConfirm={() => onCloseEditor?.()}
        title="Discard changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
      />
    </>
  );
}
