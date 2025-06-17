/**
 * Form Component Types
 * 
 * This file contains type definitions for form-related components
 * including inputs, selectors, and dialog forms.
 */

import { ReactNode } from 'react';
import { SxProps, Theme } from '@mui/material';
import { Task } from './task';
import { TimeEntry } from './timer';

// Form Input Types
export interface TaskSelectorProps {
  value: string;
  onChange: (value: string, task?: Task | null) => void;
  predefinedTasks: Task[];
  onCreateNewTask?: (taskName: string) => Promise<Task>;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  placeholder?: string;
  sx?: SxProps<Theme>;
  timeEntries?: TimeEntry[];
}

export interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

export interface CurrencyInputProps {
  value: string | number;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  currency?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  min?: number;
  max?: number;
  step?: number;
  sx?: SxProps<Theme>;
}

// Dialog Types
export interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSubmit?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: 'warning' | 'error' | 'info';
  sx?: SxProps<Theme>;
}

export interface EditTimeEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EditTimeEntryData) => void;
  entry: EditTimeEntryData | null;
  tasks: Task[];
}

// Form Data Types
export interface EditTimeEntryData {
  id: string;
  taskName: string;
  startTime: string;
  endTime: string;
  duration?: number;
}

export interface FormValidation {
  isValid: boolean;
  errors: Record<string, string>;
}

export interface FormState<T = any> {
  data: T;
  validation: FormValidation;
  isSubmitting: boolean;
  isDirty: boolean;
}
