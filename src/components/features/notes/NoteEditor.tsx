/**
 * Note Editor Component
 *
 * Dynamic form generator for creating and editing task notes based on templates.
 * Features collapsible interface, auto-save, and field validation.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Collapse,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Save as SaveIcon,
  Clear as ClearIcon,
  Notes as NotesIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import {NoteEditorProps, TemplateField, NoteTemplate, TaskNote} from '../../../types';
import { FREE_FORM_TEMPLATE_ID, FREE_FORM_TEMPLATE_NAME } from '../../../utils/notes';

import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { ConfirmDialog } from '../../ui';

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
  const { templates } = useNoteTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(initialTemplate);
  // The note's task: chosen in the picker when `tasks` is given, else the prop
  const [selectedTaskId, setSelectedTaskId] = useState(existingNote?.taskId ?? taskId);
  // A new note keeps its draft layout after auto-save creates it, so the
  // text field you're typing in isn't swapped out from under you.
  const startedAsNew = useRef(!existingNote).current;

  // Track the current note so that auto-save can update existing notes and
  // newly created notes without requiring the parent component to refresh the
  // editor.
  const [currentNote, setCurrentNote] = useState<TaskNote | null>(existingNote || null);

  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [copySnackbar, setCopySnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Initialize field values from existing note or template defaults
  useEffect(() => {
    if (existingNote) {
      const values = { ...existingNote.fieldValues };
      if (selectedTemplate) {
        selectedTemplate.fields.forEach(field => {
          if (field.type === 'number') {
            const val = values[field.id];
            values[field.id] = val === undefined || val === null || val === '' ? null : Number(val);
          }
        });
      }
      setFieldValues(values);
      setHasUnsavedChanges(false);
      setCurrentNote(existingNote);
    } else if (selectedTemplate) {
      // Initialize with empty values based on field types
      const initialValues: Record<string, any> = {};
      selectedTemplate.fields.forEach(field => {
        switch (field.type) {
          case 'text':
            initialValues[field.id] = '';
            break;
          case 'number':
            initialValues[field.id] = null;
            break;
          case 'date':
            initialValues[field.id] = '';
            break;
        }
      });
      setFieldValues(initialValues);
      setHasUnsavedChanges(false);
    } else if (!existingNote && !selectedTemplate) {
      // For new free-form notes
      setFieldValues({ content: '' });
      setHasUnsavedChanges(false);
    }
  }, [existingNote, selectedTemplate]);

  useEffect(() => {
    if (!existingNote) setSelectedTaskId(taskId);
  }, [taskId, existingNote]);

  const handleTaskChange = useCallback((nextTaskId: string) => {
    setSelectedTaskId(nextTaskId);
    setHasUnsavedChanges(true);
  }, []);

  const handleFieldChange = useCallback((fieldId: string, value: any) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    setHasUnsavedChanges(true);

    // Clear error for this field
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  }, [errors]);

  const handleCheckboxChange = useCallback((fieldId: string, checked: boolean) => {
    handleFieldChange(fieldId, checked);
  }, [handleFieldChange]);

  const handleSelectChange = useCallback((fieldId: string, value: string) => {
    handleFieldChange(fieldId, value);
  }, [handleFieldChange]);

  const validateFields = useCallback((): boolean => {
    if (!selectedTemplate) return true; // No template, no field-specific validation

    const newErrors: Record<string, string> = {};

    selectedTemplate.fields.forEach((field: TemplateField) => {
      const value = fieldValues[field.id];

      // Required field validation
      if (field.required && (value === undefined || value === null || value === '')) {
        newErrors[field.id] = `${field.label} is required`;
        return;
      }

      // Skip validation for empty optional fields
      if (!field.required && (value === undefined || value === null || value === '')) {
        return;
      }

      // Type-specific validation
      switch (field.type) {
        case 'number': {
          const numValue = typeof value === 'number' ? value : Number(value);
          if (isNaN(numValue)) {
            newErrors[field.id] = `${field.label} must be a valid number`;
          } else {
            if (field.validation?.min !== undefined && numValue < field.validation.min) {
              newErrors[field.id] = `${field.label} must be at least ${field.validation.min}`;
            }
            if (field.validation?.max !== undefined && numValue > field.validation.max) {
              newErrors[field.id] = `${field.label} must be at most ${field.validation.max}`;
            }
          }
          break;
        }
        case 'date':
          if (value && isNaN(Date.parse(value))) {
            newErrors[field.id] = `${field.label} must be a valid date`;
          }
          break;
        case 'text':
          if (typeof value === 'string') {
            if (field.validation?.min !== undefined && value.length < field.validation.min) {
              newErrors[field.id] = `${field.label} must be at least ${field.validation.min} characters`;
            }
            if (field.validation?.max !== undefined && value.length > field.validation.max) {
              newErrors[field.id] = `${field.label} must be at most ${field.validation.max} characters`;
            }
            if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
              newErrors[field.id] = `${field.label} format is invalid`;
            }
          }
          break;
        case 'checkbox':
          // Checkbox validation - just check if required and not checked
          if (field.required && !value) {
            newErrors[field.id] = `${field.label} is required`;
          }
          break;
        case 'select':
          // Select validation - check if value is in options
          if (field.required && !value) {
            newErrors[field.id] = `${field.label} is required`;
          } else if (value && field.options) {
            const validValues = field.options.map(opt => opt.value);
            if (!validValues.includes(value)) {
              newErrors[field.id] = `${field.label} has an invalid selection`;
            }
          }
          break;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [selectedTemplate, fieldValues]);

  const handleSave = useCallback(
    async (closeEditor = true) => {
      setIsSaving(true);
      try {
        let processedValues = { ...fieldValues };
        if (selectedTemplate) {
          selectedTemplate.fields.forEach(field => {
            if (field.type === 'number') {
              const val = processedValues[field.id];
              processedValues[field.id] = val === undefined || val === null || val === '' ? null : Number(val);
            }
          });
        }

        if (currentNote) {
          if (selectedTemplate && !validateFields()) return;
          // Content and task only: the note keeps its own session/timer link
          // wherever it's edited from.
          await onUpdateNote(currentNote.id, {
            fieldValues: processedValues,
            taskId: selectedTaskId,
          });
          setFieldValues(processedValues);
          setLastSaved(new Date());
          setHasUnsavedChanges(false);
          if (closeEditor) onCloseEditor?.();
          return;
        }

        let noteToSave: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>;

        if (selectedTemplate) {
          // Validate fields only if a template is selected
          if (!validateFields()) {
            setIsSaving(false); // Reset saving state if validation fails
            return;
          }
          noteToSave = {
            taskId: selectedTaskId,
            templateId: selectedTemplate.id,
            templateName: selectedTemplate.name,
            fieldValues: processedValues,
            timeEntryId,
            sessionId,
            timerInstanceId,
            noteLevel,
            isArchived: false,
          };
        } else {
          // Free-form note: nothing to save until there's text
          const content = String(processedValues.content ?? '');
          if (!content.trim()) {
            if (closeEditor) onCloseEditor?.();
            return;
          }
          noteToSave = {
            taskId: selectedTaskId,
            templateId: FREE_FORM_TEMPLATE_ID,
            templateName: FREE_FORM_TEMPLATE_NAME,
            fieldValues: { content },
            timeEntryId,
            sessionId,
            timerInstanceId,
            noteLevel,
            isArchived: false,
          };
        }

        const saved = await onSaveNote(noteToSave);
        setFieldValues(processedValues);

        setCurrentNote(saved);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        if (closeEditor) onCloseEditor?.();
      } catch (error) {
        console.error('Failed to save note:', error);
        const message = error instanceof Error ? error.message : 'Failed to save note';
        setSaveError(message);
      } finally {
        setIsSaving(false);
      }
    },
    [
      selectedTemplate,
      validateFields,
      currentNote,
      onUpdateNote,
      onSaveNote,
      selectedTaskId,
      fieldValues,
      timeEntryId,
      sessionId,
      timerInstanceId,
      noteLevel,
      onCloseEditor,
    ]
  );

  const handleClear = useCallback(() => {
    if (selectedTemplate) {
      const clearedValues: Record<string, any> = {};
      selectedTemplate.fields.forEach((field: TemplateField) => {
        switch (field.type) {
          case 'text':
            clearedValues[field.id] = '';
            break;
          case 'number':
            clearedValues[field.id] = null;
            break;
          case 'date':
            clearedValues[field.id] = '';
            break;
        }
      });
      setFieldValues(clearedValues);
    } else {
      // Clear for free-form notes
      setFieldValues({ content: '' });
    }
    setErrors({});
    setHasUnsavedChanges(true);
  }, [selectedTemplate]);

  const handleCopyFieldValue = useCallback(async (fieldId: string, fieldLabel: string) => {
    const value = fieldValues[fieldId];
    if (value === undefined || value === null || value === '') {
      setCopySnackbar({
        open: true,
        message: `No content to copy from ${fieldLabel}`,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(String(value));
      setCopySnackbar({
        open: true,
        message: `Copied ${fieldLabel} content to clipboard`,
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setCopySnackbar({
        open: true,
        message: `Failed to copy ${fieldLabel} content`,
      });
    }
  }, [fieldValues]);

  // Auto-save note changes after a short period of inactivity. This prevents
  // data loss and keeps notes in sync without manual interaction.
  // Nothing to save yet: a new free-form note without text (e.g. only its
  // task picked), or fields showing errors. Saving those would fail or be
  // skipped, and each attempt would re-arm this timer every second.
  const isEmptyNewNote =
    !currentNote && !selectedTemplate && !String(fieldValues.content ?? '').trim();
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (autoSaveDisabled) return;
    if (!hasUnsavedChanges) return;
    if (isSaving) return;
    if (isEmptyNewNote || hasErrors) return;

    const timeout = setTimeout(() => {
      // Persist changes but keep the editor open
      handleSave(false);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [fieldValues, hasUnsavedChanges, isSaving, handleSave, autoSaveDisabled, isEmptyNewNote, hasErrors]);

  const renderField = useCallback((field: TemplateField) => {
    const value = fieldValues[field.id];
    const error = errors[field.id];

    const commonProps = {
      label: field.label,
      value: value ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        handleFieldChange(field.id, e.target.value),
      error: !!error,
      helperText: error || field.placeholder,
      required: field.required,
      fullWidth: true,
      size: 'small' as const,
    };

    switch (field.type) {
      case 'text':
        return (
          <TextField
            {...commonProps}
            multiline
            minRows={4}
            maxRows={12}
            placeholder={field.placeholder}
            sx={{
              '& .MuiInputBase-root': {
                alignItems: 'flex-start',
              },
              '& .MuiInputBase-input': {
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                lineHeight: 1.5,
              },
            }}
          />
        );
      case 'number':
        return (
          <TextField
            {...commonProps}
            type="number"
            value={value ?? ''}
            onChange={(e) =>
              handleFieldChange(
                field.id,
                e.target.value === '' ? null : Number(e.target.value)
              )
            }
            placeholder={field.placeholder}
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
            {...commonProps}
            type="date"
            slotProps={{
              inputLabel: { shrink: true }
            }}
          />
        );
      case 'checkbox':
        return (
          <FormControlLabel
            control={
              <Checkbox
                checked={!!value}
                onChange={(e) => handleCheckboxChange(field.id, e.target.checked)}
                color="primary"
              />
            }
            label={field.label}
            required={field.required}
            sx={{ alignItems: 'flex-start' }}
          />
        );
      case 'select':
        return (
          <FormControl fullWidth size="small" error={!!error} required={field.required}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={value ?? ''}
              onChange={(e) => handleSelectChange(field.id, e.target.value)}
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
            {(error || field.placeholder) && (
              <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ mt: 0.5, ml: 1.5 }}>
                {error || field.placeholder}
              </Typography>
            )}
          </FormControl>
        );
      default:
        return null;
    }
  }, [fieldValues, errors, handleFieldChange, handleCheckboxChange, handleSelectChange]);

  const notesSummary = useMemo(() => {
    if (!selectedTemplate) {
      const content = fieldValues.content || '';
      return content.length > 0 ? `${content.length} characters` : 'Empty note';
    }

    const filledFields = selectedTemplate.fields.filter((field: TemplateField) => {
      const value = fieldValues[field.id];
      return value !== undefined && value !== null && value !== '';
    }).length;

    return `${filledFields}/${selectedTemplate.fields.length} fields completed`;
  }, [selectedTemplate, fieldValues]);

  const lastSavedText = useMemo(() => {
    if (!lastSaved) return '';

    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) return `Saved ${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Saved ${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `Saved ${diffHours}h ago`;
  }, [lastSaved]);

  const handleCloseEditor = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true);
      return;
    }
    onCloseEditor?.();
  }, [hasUnsavedChanges, onCloseEditor]);

  const handleConfirmDiscard = useCallback(() => {
    onCloseEditor?.();
  }, [onCloseEditor]);

  const taskPicker = tasks ? (
    <FormControl fullWidth size="small">
      <InputLabel id="note-task-label">Task</InputLabel>
      <Select
        labelId="note-task-label"
        label="Task"
        value={selectedTaskId}
        onChange={(e) => handleTaskChange(e.target.value)}
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
  ) : null;

  // A new free-form note: template choice (until it's saved) and the text
  if (!selectedTemplate && (!currentNote || startedAsNew)) {
    return (
      <>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={2}>
            {!currentNote && (
              <Alert severity="info">
                No template selected. You can choose a template below or create a free-form note.
              </Alert>
            )}
            {taskPicker}
            {/* Template choice only until the note is first saved */}
            {!currentNote && (
              <FormControl fullWidth size="small">
                <InputLabel>Select Template</InputLabel>
                <Select
                  value={''}
                  onChange={(e) => {
                    const selected = templates.find((t: NoteTemplate) => t.id === e.target.value);
                    setSelectedTemplate(selected || null);
                    // If a template is selected, initialize its fields. Otherwise, clear for free-form.
                    if (selected) {
                      const initialValues: Record<string, any> = {};
                      selected.fields.forEach((field: TemplateField) => {
                        initialValues[field.id] = field.type === 'number' ? null : '';
                      });
                      setFieldValues(initialValues);
                    } else {
                      setFieldValues({ content: fieldValues.content || '' }); // Keep existing content if switching to free-form
                    }
                  }}
                  label="Select Template"
                >
                  <MenuItem value="">
                    <em>Free-form Note</em>
                  </MenuItem>
                  {templates.map((tmpl: NoteTemplate) => (
                    <MenuItem key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              label="Note Content"
              multiline
              minRows={4}
              maxRows={12}
              fullWidth
              value={fieldValues.content || ''}
              onChange={(e) => handleFieldChange('content', e.target.value)}
              placeholder="Start typing your note here..."
            />

            <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
              <Button
                variant="contained"
                startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={() => handleSave()}
                disabled={isSaving || Object.keys(errors).length > 0}
              >
                {currentNote ? 'Update Note' : 'Save Note'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClear}
                disabled={isSaving}
              >
                Clear
              </Button>
              <Button
                variant="outlined"
                color={currentNote ? 'inherit' : 'error'}
                onClick={handleCloseEditor}
                disabled={isSaving}
              >
                {currentNote ? 'Close' : 'Cancel'}
              </Button>
            </Box>
          </Stack>
        </Paper>
        <ConfirmDialog
          open={showDiscardDialog}
          onClose={() => setShowDiscardDialog(false)}
          onConfirm={handleConfirmDiscard}
          title="Discard changes?"
          message="You have unsaved changes. Are you sure you want to discard them?"
          confirmLabel="Discard"
          cancelLabel="Keep Editing"
        />
      </>
    );
  }

  return (
    <>
    <Paper sx={{ mb: 2 }}>
      {/* Collapsed Header */}
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
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
            Notes - {selectedTemplate?.name || 'Free-form Note'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {notesSummary}
            {hasUnsavedChanges && ' • Unsaved changes'}
            {lastSavedText && ` • ${lastSavedText}`}
          </Typography>
        </Box>
        <IconButton size="small" aria-label={isCollapsed ? 'Expand notes' : 'Collapse notes'}>
          {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
        </IconButton>
      </Box>

      {/* Expanded Content */}
      <Collapse in={!isCollapsed}>
        <Box sx={{ p: 2, pt: 0 }}>
          <Stack spacing={2}>
            {taskPicker}

            {/* Template Info */}
            {selectedTemplate && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Chip
                  label={(selectedTemplate as NoteTemplate).name}
                  color="primary"
                  variant="outlined"
                  size="small"
                />
                {(selectedTemplate as NoteTemplate).description && (
                  <Typography variant="body2" color="text.secondary">
                    {(selectedTemplate as NoteTemplate).description}
                  </Typography>
                )}
              </Box>
            )}

            {/* Form Fields */}
            {selectedTemplate && (
              <Stack spacing={2}>
                {selectedTemplate.fields
                  .sort((a: TemplateField, b: TemplateField) => a.order - b.order)
                  .map((field: TemplateField) => (
                    <Box key={field.id} sx={{ position: 'relative' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          {renderField(field)}
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyFieldValue(field.id, field.label)}
                          title={`Copy ${field.label} content`}
                          sx={{ mt: 1 }}
                        >
                          <CopyIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  ))}
              </Stack>
            )}
            {!selectedTemplate && (
              <TextField
                label="Note Content"
                multiline
                minRows={4}
                maxRows={12}
                fullWidth
                value={fieldValues.content || ''}
                onChange={(e) => handleFieldChange('content', e.target.value)}
                placeholder="Start typing your note here..."
              />
            )}

            {/* Actions */}
            <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
              <Button
                variant="contained"
                startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={() => handleSave()}
                disabled={isSaving || Object.keys(errors).length > 0}
              >
                {currentNote ? 'Update Note' : 'Save Note'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClear}
                disabled={isSaving}
              >
                Clear
              </Button>
              {currentNote && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => onDeleteNote(currentNote.id)}
                  disabled={isSaving}
                >
                  Delete Note
                </Button>
              )}
              {onCloseEditor && (
                <Button variant="outlined" onClick={handleCloseEditor} disabled={isSaving}>
                  Close
                </Button>
              )}
            </Box>

            {/* Status */}
            {hasUnsavedChanges && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                You have unsaved changes. Click "Save Note" to save your work.
              </Alert>
            )}
          </Stack>
        </Box>
      </Collapse>

      {/* Copy Snackbar */}
      <Snackbar
        open={copySnackbar.open}
        autoHideDuration={3000}
        onClose={() => setCopySnackbar({ open: false, message: '' })}
        message={copySnackbar.message}
      />

      {/* Save Error Snackbar */}
      <Snackbar
        open={!!saveError}
        autoHideDuration={6000}
        onClose={() => setSaveError(null)}
      >
        <Alert severity="error" onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      </Snackbar>
    </Paper>
    <ConfirmDialog
      open={showDiscardDialog}
      onClose={() => setShowDiscardDialog(false)}
      onConfirm={handleConfirmDiscard}
      title="Discard changes?"
      message="You have unsaved changes. Are you sure you want to discard them?"
      confirmLabel="Discard"
      cancelLabel="Keep Editing"
    />
    </>
  );
}
