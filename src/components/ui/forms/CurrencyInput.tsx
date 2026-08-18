import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { CurrencyInputProps } from '../../../types/form';

/**
 * Currency input component with proper formatting and validation
 * Handles currency symbol display and numeric validation
 */
export function CurrencyInput({
  value,
  onChange,
  label = 'Amount',
  placeholder = '0.00',
  currency = '$',
  error = false,
  helperText,
  disabled = false,
  fullWidth = true,
  min = 0,
  max = 999999,
  step = 0.01,
  sx,
}: CurrencyInputProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = event.target.value;
    
    // Remove currency symbol and any non-numeric characters except decimal point
    inputValue = inputValue.replace(/[^\d.]/g, '');
    
    // Ensure only one decimal point
    const decimalCount = (inputValue.match(/\./g) || []).length;
    if (decimalCount > 1) {
      const firstDecimalIndex = inputValue.indexOf('.');
      inputValue = inputValue.substring(0, firstDecimalIndex + 1) + 
                   inputValue.substring(firstDecimalIndex + 1).replace(/\./g, '');
    }
    
    // Limit decimal places to 2
    const decimalIndex = inputValue.indexOf('.');
    if (decimalIndex !== -1 && inputValue.length > decimalIndex + 3) {
      inputValue = inputValue.substring(0, decimalIndex + 3);
    }
    
    // Validate range
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue)) {
      if (numValue < min) {
        inputValue = min.toString();
      } else if (numValue > max) {
        inputValue = max.toString();
      }
    }
    
    onChange(inputValue);
  };

  const displayValue = typeof value === 'number' ? value.toString() : value;

  return (
    <TextField
      label={label}
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      error={error}
      helperText={helperText}
      disabled={disabled}
      fullWidth={fullWidth}
      type="text"
      sx={sx}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              {currency}
            </InputAdornment>
          ),
        },

        htmlInput: {
          inputMode: 'decimal',
          pattern: '[0-9]*[.]?[0-9]*',
          min,
          max,
          step,
        }
      }} />
  );
}
