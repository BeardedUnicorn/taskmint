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
  /** May return a promise: the dialog waits for it, closing when it resolves and staying open if it rejects. */
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  severity?: 'warning' | 'error' | 'info';
  sx?: SxProps<Theme>;
}

export interface EditTimeEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EditTimeEntryData) => void;
  entry: EditTimeEntryData | null;
  /** Every task (the picker offers the active ones, plus the entry's own). */
  tasks: Task[];
}

// Form Data Types
export interface EditTimeEntryData {
  id: string;          // timer-instance id (may carry "session_" prefix)
  taskId: string;      // the entry's task; a different one on save moves it
  durationMs: number;  // net tracked duration: prefill in, edited value out
  startTime?: string;  // ISO, display-only caption; never written back
}
