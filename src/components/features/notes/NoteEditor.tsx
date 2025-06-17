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
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Save as SaveIcon,
  Clear as ClearIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import { NoteEditorProps, TemplateField } from '../../../types/notes';

export function NoteEditor({
  taskId,
  template,
  existingNote,
  onSaveNote,
  onUpdateNote,
  onDeleteNote,
  isCollapsed,
  onToggleCollapse,
}: NoteEditorProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
      default:
        return null;
    }
  }, [fieldValues, errors, handleFieldChange]);

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
                <Box key={field.id}>
                  {renderField(field)}
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
    </Paper>
  );
}
