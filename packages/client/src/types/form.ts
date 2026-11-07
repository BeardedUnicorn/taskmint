/**
 * Form Component Types
 *
 * This file contains type definitions for form-related components
 * including inputs, selectors, and dialog forms.
 */

import { ReactNode } from 'react';
import { SxProps, Theme } from '@mui/material';
import { Task } from './task';

// Form Input Types
export interface TaskSelectorProps {
  /** The task name chosen or typed */
  value: string;
  onChange: (value: string, task?: Task | null) => void;
  predefinedTasks: Task[];
  onCreateNewTask: (taskName: string) => Promise<Task>;
  placeholder: string;
}

export interface CurrencyInputProps {
  /** The amount as typed */
  value: string;
  onChange: (value: string) => void;
  label: string;
  error: boolean;
  helperText?: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

// Dialog Types
/** An open dialog around a form, with Cancel and Save. */
export interface FormDialogProps {
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSubmit: () => void;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** May return a promise: the dialog waits for it, closing when it resolves and staying open if it rejects. */
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The alert's and the confirm button's color; an error starts on Cancel. */
  severity?: 'warning' | 'error';
}

/** Rendered while an entry is being edited. */
export interface EditTimeEntryDialogProps {
  onClose: () => void;
  onSave: (data: EditTimeEntryData) => void;
  entry: EditTimeEntryData & { startTime: string };
  /** Every task (the picker offers the active ones, plus the entry's own). */
  tasks: Task[];
}

// Form Data Types
export interface EditTimeEntryData {
  id: string; // timer-instance id (may carry "session_" prefix)
  taskId: string; // the entry's task; a different one on save moves it
  durationMs: number; // net tracked duration: prefill in, edited value out
  startTime?: string; // ISO, display-only caption; never written back
}
