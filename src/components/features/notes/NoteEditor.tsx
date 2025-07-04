/**
 * Note Editor Component
 *
 * Dynamic form generator for creating and editing task notes based on templates.
 * Features collapsible interface, auto-save, and field validation.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  PlayArrow as RunIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import {NoteEditorProps, TemplateField, NoteTemplate, TaskNote} from '../../../types';

import { useNoteTemplates } from '../../../hooks/useNoteTemplates';

export function NoteEditor({
                             taskId,
                             template: initialTemplate,
                             existingNote,
                             timeEntryId,
                             onSaveNote,
                             onUpdateNote,
                             onDeleteNote,
                             isCollapsed,
                             onToggleCollapse,
                             onCloseEditor,
                           }: NoteEditorProps) {
  const { templates } = useNoteTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(initialTemplate);

  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningCommand, setIsRunningCommand] = useState<Record<string, boolean>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [copySnackbar, setCopySnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });

  // Initialize field values from existing note or template defaults
  useEffect(() => {
    if (existingNote) {
      setFieldValues(existingNote.fieldValues);
      setHasUnsavedChanges(false);
    } else if (selectedTemplate) {
      // Initialize with empty values based on field types
      const initialValues: Record<string, any> = {};
      selectedTemplate.fields.forEach(field => {
        switch (field.type) {
          case 'text':
          case 'command':
            initialValues[field.id] = '';
            break;
          case 'number':
            initialValues[field.id] = '';
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

  // Run commands for new notes
  useEffect(() => {
    if (!existingNote && selectedTemplate) {
      selectedTemplate.fields.forEach(field => {
        if (field.type === 'command' && field.command) {
          runCommand(field.id, field.command);
        }
      });
    }
  }, [selectedTemplate, existingNote]);

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

  const runCommand = useCallback(async (fieldId: string, command: string) => {
    setIsRunningCommand(prev => ({ ...prev, [fieldId]: true }));
    try {
      const output = await invoke<string>('execute_cli_command', { command });
      handleFieldChange(fieldId, output.trim());
    } catch (error) {
      console.error('Failed to run command:', error);
      setErrors(prev => ({ ...prev, [fieldId]: 'Failed to run command' }));
    } finally {
      setIsRunningCommand(prev => ({ ...prev, [fieldId]: false }));
    }
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
        case 'number':
          if (isNaN(Number(value))) {
            newErrors[field.id] = `${field.label} must be a valid number`;
          } else {
            const numValue = Number(value);
            if (field.validation?.min !== undefined && numValue < field.validation.min) {
              newErrors[field.id] = `${field.label} must be at least ${field.validation.min}`;
            }
            if (field.validation?.max !== undefined && numValue > field.validation.max) {
              newErrors[field.id] = `${field.label} must be at most ${field.validation.max}`;
            }
          }
          break;
        case 'date':
          if (value && isNaN(Date.parse(value))) {
            newErrors[field.id] = `${field.label} must be a valid date`;
          }
          break;
        case 'text':
        case 'command':
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

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      if (existingNote) {
        await onUpdateNote(existingNote.id, { fieldValues });
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        onCloseEditor?.();
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
          taskId,
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          fieldValues,
          timeEntryId,
        };
      } else {
        // Free-form note
        noteToSave = {
          taskId,
          templateId: 'free-form',
          templateName: 'Free-form Note',
          fieldValues: { content: fieldValues.content || '' },
          timeEntryId,
        };
      }

      await onSaveNote(noteToSave);

      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      onCloseEditor?.(); // Close editor after successful save
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setIsSaving(false);
    }
  }, [selectedTemplate, validateFields, existingNote, onUpdateNote, onSaveNote, taskId, fieldValues, timeEntryId, onCloseEditor]);

  const handleClear = useCallback(() => {
    if (selectedTemplate) {
      const clearedValues: Record<string, any> = {};
      selectedTemplate.fields.forEach((field: TemplateField) => {
        switch (field.type) {
          case 'text':
          case 'command':
            clearedValues[field.id] = '';
            break;
          case 'number':
            clearedValues[field.id] = '';
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

  const renderField = useCallback((field: TemplateField) => {
    const value = fieldValues[field.id] || '';
    const error = errors[field.id];

    const commonProps = {
      label: field.label,
      value,
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
            placeholder={field.placeholder}
            inputProps={{
              min: field.validation?.min,
              max: field.validation?.max,
            }}
          />
        );
      case 'date':
        return (
          <TextField
            {...commonProps}
            type="date"
            InputLabelProps={{ shrink: true }}
          />
        );
      case 'command':
        return (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <TextField
              {...commonProps}
              multiline
              minRows={4}
              maxRows={12}
              placeholder={field.placeholder}
              sx={{
                flex: 1,
                '& .MuiInputBase-root': {
                  alignItems: 'flex-start',
                  backgroundColor: '#E8F8F5',
                  border: '1px solid',
                  borderColor: 'secondary.main',
                },
                '& .MuiInputBase-input': {
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  lineHeight: 1.5,
                  fontFamily: '"Roboto Mono", monospace',
                },
              }}
            />
            <IconButton
              onClick={() => field.command && runCommand(field.id, field.command)}
              disabled={isRunningCommand[field.id] || !field.command}
              title="Run Command"
            >
              {isRunningCommand[field.id] ? <CircularProgress size={24} /> : <RunIcon />}
            </IconButton>
          </Box>
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
              value={value || ''}
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
  }, [fieldValues, errors, handleFieldChange, handleCheckboxChange, handleSelectChange, isRunningCommand, runCommand]);

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
    onCloseEditor?.();
  }, [onCloseEditor]);

  // If no template is selected and we are creating a new note, allow template selection
  if (!selectedTemplate && !existingNote) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            No template selected. You can choose a template below or create a free-form note.
          </Alert>
          <FormControl fullWidth size="small">
            <InputLabel>Select Template</InputLabel>
            <Select
              value={selectedTemplate?.id || ''}
              onChange={(e) => {
                const selected = templates.find((t: NoteTemplate) => t.id === e.target.value);
                setSelectedTemplate(selected || null);
                // If a template is selected, initialize its fields. Otherwise, clear for free-form.
                if (selected) {
                  const initialValues: Record<string, any> = {};
                  selected.fields.forEach((field: TemplateField) => {
                    initialValues[field.id] = '';
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
              onClick={handleSave}
              disabled={isSaving || Object.keys(errors).length > 0}
            >
              {existingNote ? 'Update Note' : 'Save Note'}
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
              color="error"
              onClick={handleCloseEditor}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </Box>
        </Stack>
      </Paper>
    );
  }

  return (
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
          <Typography variant="subtitle1" fontWeight="medium">
            Notes - {selectedTemplate?.name || 'Free-form Note'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {notesSummary}
            {hasUnsavedChanges && ' • Unsaved changes'}
            {lastSavedText && ` • ${lastSavedText}`}
          </Typography>
        </Box>
        <IconButton size="small">
          {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
        </IconButton>
      </Box>

      {/* Expanded Content */}
      <Collapse in={!isCollapsed}>
        <Box sx={{ p: 2, pt: 0 }}>
          <Stack spacing={2}>
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
                onClick={handleSave}
                disabled={isSaving || Object.keys(errors).length > 0}
              >
                {existingNote ? 'Update Note' : 'Save Note'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClear}
                disabled={isSaving}
              >
                Clear
              </Button>
              {existingNote && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => onDeleteNote(existingNote.id)}
                  disabled={isSaving}
                >
                  Delete Note
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
    </Paper>
  );
}
