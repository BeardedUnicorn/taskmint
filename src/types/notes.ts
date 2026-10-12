/**
 * Note Templates and Task Notes Related Types
 *
 * This file contains all types related to the templated notes functionality,
 * including note templates, template fields, task notes, and related operations.
 */

import { z } from 'zod';

// Field Types
export type FieldType = 'text' | 'number' | 'date' | 'checkbox' | 'select';

export interface SelectOption {
  label: string;
  value: string;
}

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  order: number;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  options?: SelectOption[]; // For select field type
}

// Note Template
export interface NoteTemplate {
  id: string;
  name: string;
  description?: string;
  fields: TemplateField[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

// Task Note
export interface TaskNote {
  id: string;
  taskId: string;
  templateId: string;
  templateName: string; // Cached for display
  fieldValues: Record<string, any>; // Field ID -> Value mapping
  timeEntryId?: string | null; // Optional link to specific time entry
  sessionId?: string | null; // Optional link to task session
  timerInstanceId?: string | null; // Optional link to timer instance
  noteLevel?: 'task' | 'session' | 'timer'; // Level of the note (defaults to 'task')
  isArchived?: boolean; // Archive status (defaults to false)
  archivedAt?: string | null; // When the note was archived
  createdAt: string;
  updatedAt: string;
}

// Field Value Types
export interface FieldValue {
  fieldId: string;
  value: string | number | Date | null;
  type: FieldType;
}

// Zod Validation Schemas
export const SelectOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

// 'command' fields (which ran a shell command to fill the value) were removed.
// Templates saved or exported before that still carry them, so they load as
// plain text fields instead of failing validation; saved values are kept.
function migrateLegacyCommandField(field: unknown): unknown {
  if (!field || typeof field !== 'object') return field;
  const record = field as Record<string, unknown>;
  if (record.type !== 'command') return field;
  const migrated: Record<string, unknown> = { ...record, type: 'text' };
  delete migrated.command;
  return migrated;
}

export const TemplateFieldSchema = z.preprocess(migrateLegacyCommandField, z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'number', 'date', 'checkbox', 'select']),
  required: z.boolean(),
  placeholder: z.string().optional(),
  order: z.number().min(0),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).optional(),
  options: z.array(SelectOptionSchema).optional(),
}));

export const NoteTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  fields: z.array(TemplateFieldSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  isActive: z.boolean(),
});

export const TaskNoteSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  templateId: z.string().min(1),
  templateName: z.string().min(1),
  fieldValues: z.record(z.string(), z.any()),
  timeEntryId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  timerInstanceId: z.string().nullable().optional(),
  noteLevel: z.enum(['task', 'session', 'timer']).default('task'),
  isArchived: z.boolean().default(false),
  archivedAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// Form Data Types
export interface TemplateFormData {
  name: string;
  description: string;
  fields: TemplateField[];
}

export interface FieldFormData {
  label: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  validation: {
    min: string;
    max: string;
    pattern: string;
  };
}

// Component Props Interfaces
export interface NoteTemplateBuilderProps {
  templates: NoteTemplate[];
  onCreateTemplate: (template: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<NoteTemplate>;
  onUpdateTemplate: (templateId: string, updates: Partial<NoteTemplate>) => Promise<NoteTemplate>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onSelectTemplate: (template: NoteTemplate | null) => void;
  selectedTemplate: NoteTemplate | null;
}

export interface NoteEditorProps {
  taskId: string;
  template: NoteTemplate | null;
  existingNote?: TaskNote | null;
  timeEntryId?: string | null; // Optional time entry context
  sessionId?: string | null; // Optional session context
  timerInstanceId?: string | null; // Optional timer instance context
  noteLevel: 'task' | 'session' | 'timer'; // Level of the note
  onSaveNote: (note: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TaskNote>;
  onUpdateNote: (noteId: string, updates: Partial<TaskNote>) => Promise<TaskNote>;
  onDeleteNote: (noteId: string) => Promise<void>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCloseEditor?: () => void; // New prop to signal editor closure
  /**
   * When true, automatic persistence of field changes is disabled. Defaults to
   * auto‑save being enabled.
   */
  autoSaveDisabled?: boolean;
}

export interface NotesListProps {
  taskId: string;
  notes: TaskNote[];
  onEditNote: (note: TaskNote) => void;
  onDeleteNote: (noteId: string) => void;
  onCreateNote: () => void;
  onArchiveNote?: (noteId: string) => void;
  onUnarchiveNote?: (noteId: string) => void;
  searchQuery?: string;
}

export interface FieldEditorProps {
  field: TemplateField;
  onUpdateField: (field: TemplateField) => void;
  onDeleteField: (fieldId: string) => void;
  onMoveField: (fieldId: string, direction: 'up' | 'down') => void;
  onCopyFieldValue?: (fieldId: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

// Hook Return Types
export interface UseNoteTemplatesReturn {
  templates: NoteTemplate[];
  createTemplate: (template: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<NoteTemplate>;
  updateTemplate: (templateId: string, updates: Partial<NoteTemplate>) => Promise<NoteTemplate>;
  deleteTemplate: (templateId: string) => Promise<void>;
  getTemplateById: (templateId: string) => NoteTemplate | undefined;
  getActiveTemplates: () => NoteTemplate[];
  isLoading: boolean;
  error: string | null;
}

export interface UseTaskNotesReturn {
  notes: TaskNote[];
  createNote: (note: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TaskNote>;
  updateNote: (noteId: string, updates: Partial<TaskNote>) => Promise<TaskNote>;
  deleteNote: (noteId: string) => Promise<void>;
  getNotesByTaskId: (taskId: string) => TaskNote[];
  getNotesByTimeEntryId: (timeEntryId: string) => TaskNote[];
  getNotesBySessionId: (sessionId: string) => TaskNote[];
  getNotesByTimerInstanceId: (timerInstanceId: string) => TaskNote[];
  getNotesByLevel: (level: 'task' | 'session' | 'timer') => TaskNote[];
  getNoteById: (noteId: string) => TaskNote | undefined;
  getNotesStats: () => {
    totalNotes: number;
    templatesUsed: string[];
    lastNoteDate?: string;
    notesByTemplate: Record<string, number>;
    notesByLevel: Record<'task' | 'session' | 'timer', number>;
  };
  isLoading: boolean;
  error: string | null;
}

// Utility Types
export interface TemplateStats {
  totalTemplates: number;
  activeTemplates: number;
  totalNotes: number;
  templatesWithNotes: number;
}

export interface NoteValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}
