/**
 * Hours + minutes inputs for a duration, shared by the Edit Time Entry and
 * Add Time dialogs. Values are strings so a field can be empty while typing;
 * parseDuration / validateDuration turn them into milliseconds and messages.
 */

import { Stack, TextField } from '@mui/material';

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_MINUTE = 60_000;

export interface DurationInput {
  hours: string;
  minutes: string;
}

export interface DurationErrors {
  hours?: string;
  minutes?: string;
  duration?: string;
}

export function splitDuration(durationMs: number): { hours: number; minutes: number } {
  const safe = Math.max(0, durationMs);
  return {
    hours: Math.floor(safe / MS_PER_HOUR),
    minutes: Math.floor((safe % MS_PER_HOUR) / MS_PER_MINUTE),
  };
}

export function parseDuration(value: DurationInput): { hours: number; minutes: number } {
  return {
    hours: value.hours.trim() === '' ? 0 : Number(value.hours),
    minutes: value.minutes.trim() === '' ? 0 : Number(value.minutes),
  };
}

/** Whole-minute milliseconds for the typed values (negatives count as 0). */
export function durationInputToMs(value: DurationInput): number {
  const { hours, minutes } = parseDuration(value);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, hours) * MS_PER_HOUR + Math.max(0, minutes) * MS_PER_MINUTE;
}

export function validateDuration(value: DurationInput): DurationErrors {
  const { hours, minutes } = parseDuration(value);
  const errors: DurationErrors = {};
  if (!Number.isInteger(hours) || hours < 0) {
    errors.hours = 'Hours must be a whole number of 0 or more';
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    errors.minutes = 'Minutes must be a whole number between 0 and 59';
  }
  if (!errors.hours && !errors.minutes && hours === 0 && minutes === 0) {
    errors.duration = 'Duration must be greater than zero';
  }
  return errors;
}

interface DurationFieldsProps {
  value: DurationInput;
  onChange: (value: DurationInput) => void;
  errors?: DurationErrors;
}

export function DurationFields({ value, onChange, errors = {} }: DurationFieldsProps) {
  return (
    <Stack direction="row" spacing={2}>
      <TextField
        label="Hours"
        type="number"
        fullWidth
        value={value.hours}
        onChange={(e) => onChange({ ...value, hours: e.target.value })}
        error={!!errors.hours}
        helperText={errors.hours}
        slotProps={{
          htmlInput: { min: 0, step: 1 },
        }}
      />
      <TextField
        label="Minutes"
        type="number"
        fullWidth
        value={value.minutes}
        onChange={(e) => onChange({ ...value, minutes: e.target.value })}
        error={!!errors.minutes}
        helperText={errors.minutes}
        slotProps={{
          htmlInput: { min: 0, max: 59, step: 1 },
        }}
      />
    </Stack>
  );
}
