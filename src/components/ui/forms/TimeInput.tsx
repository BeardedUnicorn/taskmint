import React from 'react';
import { TextField } from '@mui/material';
import { TimeInputProps } from '../../../types/form';

/**
 * Time input component with validation and formatting
 * Accepts time in HH:MM:SS format with proper validation
 */
export function TimeInput({
  value,
  onChange,
  label = 'Time',
  placeholder = '00:00:00',
  error = false,
  helperText = 'Enter time in HH:MM:SS format',
  disabled = false,
  fullWidth = true,
  size = 'medium',
  sx,
}: TimeInputProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = event.target.value;
    
    // Remove any non-digit and non-colon characters
    inputValue = inputValue.replace(/[^\d:]/g, '');
    
    // Auto-format as user types
    if (inputValue.length === 2 && !inputValue.includes(':')) {
      inputValue += ':';
    } else if (inputValue.length === 5 && inputValue.split(':').length === 2) {
      inputValue += ':';
    }
    
    // Limit to HH:MM:SS format
    const parts = inputValue.split(':');
    if (parts.length > 3) {
      inputValue = parts.slice(0, 3).join(':');
    }
    
    // Validate each part
    const validatedParts = parts.map((part, index) => {
      if (part.length > 2) {
        part = part.slice(0, 2);
      }
      
      const num = parseInt(part, 10);
      if (isNaN(num)) return part;
      
      // Hours: 0-23, Minutes/Seconds: 0-59
      const max = index === 0 ? 23 : 59;
      if (num > max) {
        return max.toString().padStart(2, '0');
      }
      
      return part;
    });
    
    const finalValue = validatedParts.join(':');
    onChange(finalValue);
  };

  const validateTimeFormat = (timeStr: string): boolean => {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5]?[0-9]):([0-5]?[0-9])$/;
    return timeRegex.test(timeStr);
  };

  const isValidTime = value === '' || validateTimeFormat(value);
  const showError = error || (!isValidTime && value !== '');

  return (
    <TextField
      label={label}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      error={showError}
      helperText={showError && !isValidTime ? 'Invalid time format' : helperText}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      sx={sx}
      inputProps={{
        maxLength: 8, // HH:MM:SS
        pattern: '[0-9]{2}:[0-9]{2}:[0-9]{2}',
      }}
    />
  );
}
