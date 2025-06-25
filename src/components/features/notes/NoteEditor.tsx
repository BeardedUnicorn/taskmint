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
import { NoteEditorProps, TemplateField } from '../../../types/notes';

export function NoteEditor({
  taskId,
  template,
  existingNote,
  timeEntryId,
  onSaveNote,
  onUpdateNote,
  onDeleteNote,
  isCollapsed,
  onToggleCollapse,
}: NoteEditorProps) {
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
    } else if (template) {
      // Initialize with empty values based on field types
      const initialValues: Record<string, any> = {};
      template.fields.forEach(field => {
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
    }
  }, [existingNote, template]);

  // Run commands for new notes
  useEffect(() => {
    if (!existingNote && template) {
      template.fields.forEach(field => {
        if (field.type === 'command' && field.command) {
          runCommand(field.id, field.command);
        }
      });
    }
  }, [template, existingNote]);

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
    if (!template) return false;

    const newErrors: Record<string, string> = {};

    template.fields.forEach(field => {
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
  }, [template, fieldValues]);

  const handleSave = useCallback(async () => {
    if (!template || !validateFields()) return;

    setIsSaving(true);
    try {
      if (existingNote) {
        await onUpdateNote(existingNote.id, { fieldValues });
      } else {
        await onSaveNote({
          taskId,
          templateId: template.id,
          templateName: template.name,
          fieldValues,
          timeEntryId,
        });
      }
      
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setIsSaving(false);
    }
  }, [template, validateFields, existingNote, onUpdateNote, onSaveNote, taskId, fieldValues]);

  const handleClear = useCallback(() => {
    if (!template) return;

    const clearedValues: Record<string, any> = {};
    template.fields.forEach(field => {
      switch (field.type) {
        case 'text':
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
    setErrors({});
    setHasUnsavedChanges(true);
  }, [template]);

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
    if (!template) return 'No template selected';
    
    const filledFields = template.fields.filter(field => {
      const value = fieldValues[field.id];
      return value !== undefined && value !== null && value !== '';
    }).length;
    
    return `${filledFields}/${template.fields.length} fields completed`;
  }, [template, fieldValues]);

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

  if (!template) {
    return (
      <Paper sx={{ p: 2 }}>
        <Alert severity="info">
          Select a template to start adding notes to this task.
        </Alert>
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
            Notes - {template.name}
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Chip
                label={template.name}
                color="primary"
                variant="outlined"
                size="small"
              />
              {template.description && (
                <Typography variant="body2" color="text.secondary">
                  {template.description}
                </Typography>
              )}
            </Box>

            {/* Form Fields */}
            {template.fields
              .sort((a, b) => a.order - b.order)
              .map(field => (
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
