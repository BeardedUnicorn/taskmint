/**
 * Field Editor Component
 *
 * One template field's settings: label, type, required, placeholder, the
 * type's validation or options, and a preview. The builder holds the field;
 * every change goes back to it whole.
 */

import { useId, useState } from 'react';
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
  Button,
  Tooltip,
} from '@mui/material';
import {
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  Delete as DeleteIcon,
  Settings as ExpandIcon,
  SettingsOutlined as CollapseIcon,
  TextFields as TextIcon,
  Numbers as NumberIcon,
  CalendarToday as DateIcon,
  CheckBox as CheckboxIcon,
  List as SelectIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import { FieldEditorProps, TemplateField, FieldType, SelectOption } from '../../../types/notes';

const FIELD_TYPE_ICONS = {
  text: TextIcon,
  number: NumberIcon,
  date: DateIcon,
  checkbox: CheckboxIcon,
  select: SelectIcon,
};

const FIELD_TYPE_LABELS = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  checkbox: 'Checkbox',
  select: 'Select',
};

type Validation = NonNullable<TemplateField['validation']>;

/** A number field's text as a limit: none when it's empty. */
const limit = (text: string, parse: (text: string) => number) => (text ? parse(text) : undefined);

export function FieldEditor({
  field,
  onUpdateField,
  onDeleteField,
  onMoveField,
  isFirst,
  isLast,
}: FieldEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const typeLabelId = useId();
  const previewLabelId = useId();
  const update = (updates: Partial<TemplateField>) => onUpdateField({ ...field, ...updates });

  // A new type starts without the old one's validation and options
  const changeType = (type: FieldType) =>
    update({
      type,
      validation: undefined,
      options: type === 'select' ? [{ label: 'Option 1', value: 'option1' }] : undefined,
    });

  // Only the limits that are set; none at all is no validation
  const changeValidation = (changes: Partial<Validation>) => {
    const validation = Object.fromEntries(
      Object.entries({ ...field.validation, ...changes }).filter(([, value]) => value !== undefined)
    ) as Validation;
    update({ validation: Object.keys(validation).length > 0 ? validation : undefined });
  };

  const options = field.options ?? [];
  const setOptions = (next: SelectOption[]) => update({ options: next });
  const addOption = () =>
    setOptions([...options, { label: `Option ${options.length + 1}`, value: `option${options.length + 1}` }]);
  const updateOption = (index: number, changes: Partial<SelectOption>) =>
    setOptions(options.map((option, i) => (i === index ? { ...option, ...changes } : option)));

  const TypeIcon = FIELD_TYPE_ICONS[field.type];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {/* Field Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: expanded ? 2 : 0 }}>
        {/* Field Type Icon */}
        <TypeIcon color="primary" />

        {/* Field Label */}
        <TextField
          value={field.label}
          onChange={e => update({ label: e.target.value })}
          variant="standard"
          placeholder="Field Label"
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              sx: { fontSize: '1rem', fontWeight: 'medium' }
            }
          }}
        />

        {/* Required Indicator */}
        {field.required && (
          <Typography variant="caption" color="error" sx={{ fontWeight: 'bold' }}>
            *
          </Typography>
        )}

        {/* Field Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {/* (A disabled button gets no hover events: the span carries the tooltip) */}
          <Tooltip title="Move Up">
            <span>
              <IconButton
                size="small"
                aria-label="Move Up"
                onClick={() => onMoveField(field.id, 'up')}
                disabled={isFirst}
              >
                <UpIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Move Down">
            <span>
              <IconButton
                size="small"
                aria-label="Move Down"
                onClick={() => onMoveField(field.id, 'down')}
                disabled={isLast}
              >
                <DownIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <IconButton
              size="small"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Field">
            <IconButton size="small" aria-label="Delete Field" onClick={() => onDeleteField(field.id)} color="error">
              <DeleteIcon />
            </IconButton>
          </Tooltip>
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
              <InputLabel id={typeLabelId}>Field Type</InputLabel>
              <Select
                labelId={typeLabelId}
                value={field.type}
                onChange={e => changeType(e.target.value as FieldType)}
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
                  checked={field.required}
                  onChange={e => update({ required: e.target.checked })}
                />
              }
              label="Required"
            />
          </Box>

          {/* Placeholder */}
          <TextField
            label="Placeholder Text"
            value={field.placeholder ?? ''}
            onChange={e => update({ placeholder: e.target.value || undefined })}
            size="small"
            placeholder="Enter placeholder text..."
            helperText="Optional hint text shown in the field"
          />

          {/* Type-specific Validation */}
          {field.type === 'text' && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Text Validation
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Min Length"
                  type="number"
                  value={field.validation?.min ?? ''}
                  onChange={e => changeValidation({ min: limit(e.target.value, parseInt) })}
                  size="small"
                  slotProps={{
                    htmlInput: { min: 0 }
                  }}
                />
                <TextField
                  label="Max Length"
                  type="number"
                  value={field.validation?.max ?? ''}
                  onChange={e => changeValidation({ max: limit(e.target.value, parseInt) })}
                  size="small"
                  slotProps={{
                    htmlInput: { min: 0 }
                  }}
                />
              </Box>
              <TextField
                label="Pattern (Regex)"
                value={field.validation?.pattern ?? ''}
                onChange={e => changeValidation({ pattern: e.target.value || undefined })}
                size="small"
                fullWidth
                sx={{ mt: 1 }}
                placeholder="^[A-Za-z]+$"
                helperText="Optional regular expression for validation"
              />
            </Box>
          )}

          {field.type === 'number' && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Number Validation
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Minimum Value"
                  type="number"
                  value={field.validation?.min ?? ''}
                  onChange={e => changeValidation({ min: limit(e.target.value, parseFloat) })}
                  size="small"
                />
                <TextField
                  label="Maximum Value"
                  type="number"
                  value={field.validation?.max ?? ''}
                  onChange={e => changeValidation({ max: limit(e.target.value, parseFloat) })}
                  size="small"
                />
              </Box>
            </Box>
          )}

          {field.type === 'select' && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Select Options
              </Typography>
              <Stack spacing={2}>
                {options.map((option, index) => (
                  <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                      label="Label"
                      value={option.label}
                      onChange={e => updateOption(index, { label: e.target.value })}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Value"
                      value={option.value}
                      onChange={e => updateOption(index, { value: e.target.value })}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <IconButton
                      onClick={() => setOptions(options.filter((_, i) => i !== index))}
                      disabled={options.length <= 1}
                      size="small"
                      color="error"
                      aria-label="Remove option"
                    >
                      <RemoveIcon />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={addOption}
                  variant="outlined"
                  size="small"
                >
                  Add Option
                </Button>
              </Stack>
            </Box>
          )}

          {/* Field Preview */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Preview
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              {field.type === 'text' && (
                <TextField
                  label={field.label}
                  placeholder={field.placeholder}
                  required={field.required}
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
              {field.type === 'number' && (
                <TextField
                  label={field.label}
                  placeholder={field.placeholder}
                  required={field.required}
                  type="number"
                  fullWidth
                  disabled
                  size="small"
                />
              )}
              {field.type === 'date' && (
                <TextField
                  label={field.label}
                  placeholder={field.placeholder}
                  required={field.required}
                  type="date"
                  fullWidth
                  disabled
                  size="small"
                  slotProps={{
                    inputLabel: { shrink: true }
                  }}
                />
              )}
              {field.type === 'checkbox' && (
                <FormControlLabel
                  control={<input type="checkbox" disabled />}
                  label={field.label}
                  required={field.required}
                />
              )}
              {field.type === 'select' && (
                <FormControl fullWidth size="small" disabled>
                  <InputLabel id={previewLabelId}>{field.label}</InputLabel>
                  <Select
                    labelId={previewLabelId}
                    value=""
                    label={field.label}
                  >
                    {options.map((option, index) => (
                      <MenuItem key={index} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Paper>
          </Box>
        </Stack>
      </Collapse>
    </Paper>
  );
}
