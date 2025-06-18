/**
 * Field Editor Component
 * 
 * Individual field configuration component with drag handles, field type selection,
 * validation settings, and field management actions.
 */

import React, { useState, useCallback } from 'react';
import {
  Paper,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Typography,
  Switch,
  FormControlLabel,
  Collapse,
  Stack,
  Divider,
} from '@mui/material';
import {
  DragIndicator as DragIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  Delete as DeleteIcon,
  Settings as ExpandIcon,
  SettingsOutlined as CollapseIcon,
  TextFields as TextIcon,
  Numbers as NumberIcon,
  CalendarToday as DateIcon,
  Terminal as CommandIcon,
} from '@mui/icons-material';
import { FieldEditorProps, TemplateField, FieldType } from '../../../types/notes';

const FIELD_TYPE_ICONS = {
  text: TextIcon,
  number: NumberIcon,
  date: DateIcon,
  command: CommandIcon,
};

const FIELD_TYPE_LABELS = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  command: 'Command',
};

export function FieldEditor({
  field,
  onUpdateField,
  onDeleteField,
  onMoveField,
  isFirst,
  isLast,
}: FieldEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [localField, setLocalField] = useState<TemplateField>(field);

  const handleFieldUpdate = useCallback((updates: Partial<TemplateField>) => {
    const updatedField = { ...localField, ...updates };
    setLocalField(updatedField);
    onUpdateField(updatedField);
  }, [localField, onUpdateField]);

  const handleLabelChange = useCallback((label: string) => {
    handleFieldUpdate({ label });
  }, [handleFieldUpdate]);

  const handleTypeChange = useCallback((type: FieldType) => {
    // Clear validation and command when type changes
    const updates: Partial<TemplateField> = { 
      type,
      validation: undefined,
      command: type === 'command' ? '' : undefined,
    };
    handleFieldUpdate(updates);
  }, [handleFieldUpdate]);

  const handleRequiredChange = useCallback((required: boolean) => {
    handleFieldUpdate({ required });
  }, [handleFieldUpdate]);

  const handlePlaceholderChange = useCallback((placeholder: string) => {
    handleFieldUpdate({ placeholder: placeholder || undefined });
  }, [handleFieldUpdate]);

  const handleValidationChange = useCallback((validationUpdates: Partial<TemplateField['validation']>) => {
    const currentValidation = localField.validation || {};
    const newValidation = { ...currentValidation, ...validationUpdates };
    
    // Remove undefined values
    Object.keys(newValidation).forEach(key => {
      if (newValidation[key as keyof typeof newValidation] === undefined || 
          newValidation[key as keyof typeof newValidation] === '') {
        delete newValidation[key as keyof typeof newValidation];
      }
    });

    handleFieldUpdate({ 
      validation: Object.keys(newValidation).length > 0 ? newValidation : undefined 
    });
  }, [localField.validation, handleFieldUpdate]);

  const handleCommandChange = useCallback((command: string) => {
    handleFieldUpdate({ command: command || undefined });
  }, [handleFieldUpdate]);

  const TypeIcon = FIELD_TYPE_ICONS[localField.type];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {/* Field Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: expanded ? 2 : 0 }}>
        {/* Drag Handle */}
        <IconButton size="small" sx={{ cursor: 'grab' }}>
          <DragIcon />
        </IconButton>

        {/* Field Type Icon */}
        <TypeIcon color="primary" />

        {/* Field Label */}
        <TextField
          value={localField.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          variant="standard"
          placeholder="Field Label"
          sx={{ flex: 1 }}
          InputProps={{
            sx: { fontSize: '1rem', fontWeight: 'medium' }
          }}
        />

        {/* Required Indicator */}
        {localField.required && (
          <Typography variant="caption" color="error" sx={{ fontWeight: 'bold' }}>
            *
          </Typography>
        )}

        {/* Field Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            size="small"
            onClick={() => onMoveField(localField.id, 'up')}
            disabled={isFirst}
            title="Move Up"
          >
            <UpIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onMoveField(localField.id, 'down')}
            disabled={isLast}
            title="Move Down"
          >
            <DownIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onDeleteField(localField.id)}
            color="error"
            title="Delete Field"
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Expanded Field Configuration */}
      <Collapse in={expanded} unmountOnExit>
        <Stack spacing={2}>
          <div data-testid="field-config">
            <Divider />
          </div>
          
          {/* Basic Settings */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Field Type</InputLabel>
              <Select
                value={localField.type}
                onChange={(e) => handleTypeChange(e.target.value as FieldType)}
                label="Field Type"
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => {
                  const Icon = FIELD_TYPE_ICONS[value as FieldType];
                  return (
                    <MenuItem key={value} value={value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Icon fontSize="small" />
                        {label}
                      </Box>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={localField.required}
                  onChange={(e) => handleRequiredChange(e.target.checked)}
                />
              }
              label="Required"
            />
          </Box>

          {/* Placeholder */}
          <TextField
            label="Placeholder Text"
            value={localField.placeholder || ''}
            onChange={(e) => handlePlaceholderChange(e.target.value)}
            size="small"
            placeholder="Enter placeholder text..."
            helperText="Optional hint text shown in the field"
          />

          {/* Type-specific Validation */}
          {localField.type === 'text' && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Text Validation
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Min Length"
                  type="number"
                  value={localField.validation?.min || ''}
                  onChange={(e) => handleValidationChange({ 
                    min: e.target.value ? parseInt(e.target.value) : undefined 
                  })}
                  size="small"
                  inputProps={{ min: 0 }}
                />
                <TextField
                  label="Max Length"
                  type="number"
                  value={localField.validation?.max || ''}
                  onChange={(e) => handleValidationChange({ 
                    max: e.target.value ? parseInt(e.target.value) : undefined 
                  })}
                  size="small"
                  inputProps={{ min: 0 }}
                />
              </Box>
              <TextField
                label="Pattern (Regex)"
                value={localField.validation?.pattern || ''}
                onChange={(e) => handleValidationChange({ 
                  pattern: e.target.value || undefined 
                })}
                size="small"
                fullWidth
                sx={{ mt: 1 }}
                placeholder="^[A-Za-z]+$"
                helperText="Optional regular expression for validation"
              />
            </Box>
          )}

          {localField.type === 'number' && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Number Validation
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Minimum Value"
                  type="number"
                  value={localField.validation?.min || ''}
                  onChange={(e) => handleValidationChange({ 
                    min: e.target.value ? parseFloat(e.target.value) : undefined 
                  })}
                  size="small"
                />
                <TextField
                  label="Maximum Value"
                  type="number"
                  value={localField.validation?.max || ''}
                  onChange={(e) => handleValidationChange({ 
                    max: e.target.value ? parseFloat(e.target.value) : undefined 
                  })}
                  size="small"
                />
              </Box>
            </Box>
          )}

          {localField.type === 'command' && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Command Configuration
              </Typography>
              <TextField
                label="CLI Command"
                value={localField.command || ''}
                onChange={(e) => handleCommandChange(e.target.value)}
                size="small"
                fullWidth
                placeholder="echo 'Hello World'"
                helperText="The CLI command to execute when the note is created or the button is clicked"
              />
            </Box>
          )}

          {/* Field Preview */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Preview
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              {localField.type === 'text' && (
                <TextField
                  label={localField.label}
                  placeholder={localField.placeholder}
                  required={localField.required}
                  multiline
                  minRows={3}
                  maxRows={6}
                  fullWidth
                  disabled
                  size="small"
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
              )}
              {localField.type === 'number' && (
                <TextField
                  label={localField.label}
                  placeholder={localField.placeholder}
                  required={localField.required}
                  type="number"
                  fullWidth
                  disabled
                  size="small"
                />
              )}
              {localField.type === 'date' && (
                <TextField
                  label={localField.label}
                  placeholder={localField.placeholder}
                  required={localField.required}
                  type="date"
                  fullWidth
                  disabled
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              )}
              {localField.type === 'command' && (
                <TextField
                  label={localField.label}
                  placeholder={localField.placeholder || 'Output from command'}
                  required={localField.required}
                  multiline
                  minRows={3}
                  maxRows={6}
                  fullWidth
                  disabled
                  size="small"
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
              )}
            </Paper>
          </Box>
        </Stack>
      </Collapse>
    </Paper>
  );
}
