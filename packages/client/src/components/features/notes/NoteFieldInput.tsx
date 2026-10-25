/**
 * One template field in the note editor: text, number, date, checkbox or
 * select. A field's placeholder doubles as its hint; an error replaces it.
 */

import { memo } from 'react';
import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { TemplateField } from '../../../types/notes';

interface NoteFieldInputProps {
  field: TemplateField;
  value: unknown;
  error?: string;
  onChange: (fieldId: string, value: unknown) => void;
}

export const NoteFieldInput = memo(function NoteFieldInput({ field, value, error, onChange }: NoteFieldInputProps) {
  const hint = error || field.placeholder;
  const text = value === undefined || value === null ? '' : String(value);

  switch (field.type) {
    case 'text':
      return (
        <TextField
          label={field.label}
          value={text}
          onChange={event => onChange(field.id, event.target.value)}
          error={!!error}
          helperText={hint}
          required={field.required}
          placeholder={field.placeholder}
          multiline
          minRows={4}
          maxRows={12}
          fullWidth
          size="small"
          sx={{
            '& .MuiInputBase-root': { alignItems: 'flex-start' },
            '& .MuiInputBase-input': { whiteSpace: 'pre-wrap', wordWrap: 'break-word', lineHeight: 1.5 },
          }}
        />
      );
    case 'number':
      return (
        <TextField
          label={field.label}
          type="number"
          value={text}
          onChange={event => onChange(field.id, event.target.value === '' ? null : Number(event.target.value))}
          error={!!error}
          helperText={hint}
          required={field.required}
          placeholder={field.placeholder}
          fullWidth
          size="small"
          slotProps={{ htmlInput: { min: field.validation?.min, max: field.validation?.max } }}
        />
      );
    case 'date':
      return (
        <TextField
          label={field.label}
          type="date"
          value={text}
          onChange={event => onChange(field.id, event.target.value)}
          error={!!error}
          helperText={hint}
          required={field.required}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      );
    case 'checkbox':
      return (
        <FormControl error={!!error} required={field.required}>
          <FormControlLabel
            control={
              <Checkbox checked={value === true} onChange={event => onChange(field.id, event.target.checked)} />
            }
            label={field.label}
            sx={{ alignItems: 'flex-start' }}
          />
          {hint && <FormHelperText>{hint}</FormHelperText>}
        </FormControl>
      );
    case 'select': {
      const labelId = `note-field-${field.id}-label`;
      return (
        <FormControl fullWidth size="small" error={!!error} required={field.required}>
          <InputLabel id={labelId}>{field.label}</InputLabel>
          <Select
            labelId={labelId}
            label={field.label}
            value={text}
            onChange={event => onChange(field.id, event.target.value)}
          >
            {!field.required && (
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
            )}
            {(field.options ?? []).map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          {hint && <FormHelperText>{hint}</FormHelperText>}
        </FormControl>
      );
    }
    default:
      return null;
  }
});
