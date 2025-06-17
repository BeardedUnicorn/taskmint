/**
 * Central Type Exports
 *
 * This file provides a central location to import all types from domain-specific
 * type files. This allows for clean imports and better organization.
 */

// Timer and Time Entry Types
export type {
  TimeEntry,
  EarningsData,
  TimeEntryFormProps,
  CalendarViewProps,
  UseSystemTrayProps,
} from './timer';

// Task Management Types
export type {
  Task,
  TaskFormData,
  TaskManagementProps,
  NewTaskDialogProps,
  UseTaskManagementReturn,
} from './task';

// Note Templates and Task Notes Types
export type {
  FieldType,
  TemplateField,
  NoteTemplate,
  TaskNote,
  FieldValue,
  TemplateFormData,
  FieldFormData,
  TemplateBuilderProps,
  NoteEditorProps,
  NotesListProps,
  FieldEditorProps,
  UseNoteTemplatesReturn,
  UseTaskNotesReturn,
  TemplateStats,
  NoteValidationResult,
  TemplateFieldSchema,
  NoteTemplateSchema,
  TaskNoteSchema,
} from './notes';



// UI Component Types
export type {
  ButtonVariant,
  ButtonSize,
  ActionButtonProps,
  TimerButtonProps,
  NavigationButtonProps,
} from './ui';

// Form Component Types
export type {
  TaskSelectorProps,
  TimeInputProps,
  CurrencyInputProps,
  FormDialogProps,
  ConfirmDialogProps,
} from './form';

// Table Component Types
export type {
  DataTableProps,
  TableColumn,
  TableRow,
  TimeEntryRowProps,
  TaskRowProps,
} from './table';

// Re-export all types for backward compatibility during migration
export * from './timer';
export * from './task';
