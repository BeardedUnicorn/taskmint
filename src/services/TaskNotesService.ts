/**
 * Task Notes Service
 * 
 * This service handles all operations related to task notes including
 * CRUD operations, validation, and note management.
 */

import { TaskNote, TaskNoteSchema, NoteTemplate } from '../types/notes';
import { StorageService } from './StorageService';
import { NoteTemplateService } from './NoteTemplateService';
import { validateWithSchema } from '../utils/validation';
import { createServiceErrorHandler } from '../utils/errorHandler';

export interface ITaskNotesService {
  getAllNotes(): Promise<TaskNote[]>;
  getNotesByTaskId(taskId: string): Promise<TaskNote[]>;
  getNotesByTimeEntryId(timeEntryId: string): Promise<TaskNote[]>;
  getNotesBySessionId(sessionId: string): Promise<TaskNote[]>;
  getNotesByTimerInstanceId(timerInstanceId: string): Promise<TaskNote[]>;
  getNoteById(noteId: string): Promise<TaskNote | null>;
  createNote(noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskNote>;
  addNotes(notes: TaskNote[]): Promise<TaskNote[]>;
  updateNote(noteId: string, updates: Partial<TaskNote>): Promise<TaskNote>;
  deleteNote(noteId: string): Promise<void>;
  deleteNotesByTaskId(taskId: string): Promise<void>;
  archiveNote(noteId: string): Promise<TaskNote>;
  unarchiveNote(noteId: string): Promise<TaskNote>;
  getActiveNotesByTaskId(taskId: string): Promise<TaskNote[]>;
  getArchivedNotesByTaskId(taskId: string): Promise<TaskNote[]>;
  getTaskNotesStats(taskId: string): Promise<{
    totalNotes: number;
    activeNotes: number;
    archivedNotes: number;
    templatesUsed: string[];
    lastNoteDate?: string;
  }>;
}

export class TaskNotesService implements ITaskNotesService {
  private static instance: TaskNotesService;
  private storageService: StorageService;
  private templateService: NoteTemplateService;
  private notesCache = new Map<string, TaskNote>();
  private errorHandler = createServiceErrorHandler('TaskNotesService');

  constructor() {
    this.storageService = StorageService.getInstance();
    this.templateService = NoteTemplateService.getInstance();
  }

  static getInstance(): TaskNotesService {
    if (!TaskNotesService.instance) {
      TaskNotesService.instance = new TaskNotesService();
    }
    return TaskNotesService.instance;
  }

  /**
   * Get all task notes
   */
  async getAllNotes(): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.storageService.getTaskNotes();
      
      // Update cache
      this.notesCache.clear();
      notes.forEach(note => {
        this.notesCache.set(note.id, note);
      });

      this.errorHandler.logInfo(`Loaded ${notes.length} notes`, 'getAllNotes');
      return notes;
    }, 'getAllNotes');
  }

  /**
   * Get notes by task ID
   */
  async getNotesByTaskId(taskId: string): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const filteredNotes = notes.filter(note => note.taskId === taskId);
      this.errorHandler.logInfo(`Found ${filteredNotes.length} notes for task`, 'getNotesByTaskId', { taskId });
      return filteredNotes;
    }, 'getNotesByTaskId', { taskId });
  }

  /**
   * Get notes by time entry ID
   */
  async getNotesByTimeEntryId(timeEntryId: string): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const filteredNotes = notes.filter(note => note.timeEntryId === timeEntryId);
      this.errorHandler.logInfo(`Found ${filteredNotes.length} notes for time entry`, 'getNotesByTimeEntryId', { timeEntryId });
      return filteredNotes;
    }, 'getNotesByTimeEntryId', { entryId: timeEntryId });
  }

  /**
   * Get notes by session ID
   */
  async getNotesBySessionId(sessionId: string): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const filteredNotes = notes.filter(note => note.sessionId === sessionId);
      this.errorHandler.logInfo(`Found ${filteredNotes.length} notes for session`, 'getNotesBySessionId', { sessionId });
      return filteredNotes;
      }, 'getNotesBySessionId', { data: { sessionId } });
  }

  /**
   * Get notes by timer instance ID
   */
  async getNotesByTimerInstanceId(timerInstanceId: string): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const filteredNotes = notes.filter(note => note.timerInstanceId === timerInstanceId);
      this.errorHandler.logInfo(
        `Found ${filteredNotes.length} notes for timer instance`,
        'getNotesByTimerInstanceId',
        { timerInstanceId }
      );
      return filteredNotes;
      }, 'getNotesByTimerInstanceId', { data: { timerInstanceId } });
  }

  /**
   * Get note by ID
   */
  async getNoteById(noteId: string): Promise<TaskNote | null> {
    return this.errorHandler.handleAsync(async () => {
      // Check cache first
      if (this.notesCache.has(noteId)) {
        this.errorHandler.logInfo('Note found in cache', 'getNoteById', { noteId });
        return this.notesCache.get(noteId)!;
      }

      // Load from storage
      const notes = await this.getAllNotes();
      const note = notes.find(note => note.id === noteId) || null;
      
      if (note) {
        this.errorHandler.logInfo('Note found in storage', 'getNoteById', { noteId });
      } else {
        this.errorHandler.logWarning('Note not found', 'getNoteById', { noteId });
      }
      
      return note;
    }, 'getNoteById', { noteId });
  }

  /**
   * Create a new task note
   */
  async createNote(noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskNote> {
    return this.errorHandler.handleAsync(async () => {
      let template: NoteTemplate | null = null;

      if (noteData.templateId !== 'free-form') {
        // Validate template exists
        template = await this.templateService.getTemplateById(noteData.templateId);
        if (!template) {
          throw new Error(`Template with ID ${noteData.templateId} not found`);
        }

        // Validate field values against template
        const validationResult = this.validateNoteFieldValues(noteData.fieldValues, template);
        if (!validationResult.isValid) {
          throw new Error(`Note validation failed: ${Object.values(validationResult.errors).join(', ')}`);
        }
      }

      const now = new Date().toISOString();
      const newNote: TaskNote = {
        ...noteData,
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        templateName: template ? template.name : noteData.templateName,
        isArchived: false, // New notes are not archived by default
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      // Validate with schema
      const schemaValidation = validateWithSchema(TaskNoteSchema, newNote);
      if (!schemaValidation.success) {
        throw new Error(`Note schema validation failed: ${schemaValidation.error}`);
      }

      // Save to storage
      const notes = await this.getAllNotes();
      notes.push(newNote);
      await this.storageService.setTaskNotes(notes);

      // Update cache
      this.notesCache.set(newNote.id, newNote);
      
      this.errorHandler.logInfo('Note created successfully', 'createNote', { 
        noteId: newNote.id, 
        taskId: noteData.taskId,
        templateId: noteData.templateId 
      });
      
      return newNote;
    }, 'createNote', { 
      taskId: noteData.taskId, 
      templateId: noteData.templateId,
      timeEntryId: noteData.timeEntryId || undefined 
    });
  }

  /**
   * Add finished notes (ids and dates already set) in one write. Notes whose
   * id is already stored, or that fail the schema, are skipped. Returns the
   * notes that were added.
   */
  async addNotes(newNotes: TaskNote[]): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const existingIds = new Set(notes.map(note => note.id));
      const added = newNotes.filter(
        note => !existingIds.has(note.id) && validateWithSchema(TaskNoteSchema, note).success
      );
      if (added.length === 0) return [];

      await this.storageService.setTaskNotes([...notes, ...added]);
      added.forEach(note => this.notesCache.set(note.id, note));
      this.errorHandler.logInfo(`Added ${added.length} notes`, 'addNotes');
      return added;
    }, 'addNotes');
  }

  /**
   * Update an existing task note
   */
  async updateNote(noteId: string, updates: Partial<TaskNote>): Promise<TaskNote> {
    return this.updateNoteInternal(noteId, updates, true);
  }

  /**
   * Internal update method with optional template validation
   */
  private async updateNoteInternal(noteId: string, updates: Partial<TaskNote>, validateTemplate: boolean = true): Promise<TaskNote> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const noteIndex = notes.findIndex(note => note.id === noteId);

      if (noteIndex === -1) {
        throw new Error(`Note with ID ${noteId} not found`);
      }

      const existingNote = notes[noteIndex];
      let template: NoteTemplate | null = null;

      // Only validate template if required and if template-related fields are being updated
      if (validateTemplate && (updates.templateId || updates.fieldValues)) {
        const templateId = updates.templateId || existingNote.templateId;
        template = await this.templateService.getTemplateById(templateId);
        if (!template) {
          throw new Error(`Template with ID ${templateId} not found`);
        }
      }

      // Apply updates
      const updatedNote: TaskNote = {
        ...existingNote,
        ...updates,
        id: noteId, // Ensure ID doesn't change
        updatedAt: new Date().toISOString(),
      };

      // Update template name if template was validated
      if (template) {
        updatedNote.templateName = template.name;
      }

      // Validate field values if they were updated and template is available
      if (updates.fieldValues && template) {
        const validationResult = this.validateNoteFieldValues(updatedNote.fieldValues, template);
        if (!validationResult.isValid) {
          throw new Error(`Note validation failed: ${Object.values(validationResult.errors).join(', ')}`);
        }
      }

      // Validate with schema
      const schemaValidation = validateWithSchema(TaskNoteSchema, updatedNote);
      if (!schemaValidation.success) {
        throw new Error(`Note schema validation failed: ${schemaValidation.error}`);
      }

      // Update in storage
      notes[noteIndex] = updatedNote;
      await this.storageService.setTaskNotes(notes);

      // Update cache
      this.notesCache.set(noteId, updatedNote);

      this.errorHandler.logInfo('Note updated successfully', 'updateNoteInternal', { 
        noteId, 
        taskId: updatedNote.taskId,
        templateValidation: validateTemplate 
      });

      return updatedNote;
    }, 'updateNoteInternal', { noteId, taskId: updates.taskId });
  }

  /**
   * Delete a task note
   */
  async deleteNote(noteId: string): Promise<void> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const noteToDelete = notes.find(note => note.id === noteId);
      const filteredNotes = notes.filter(note => note.id !== noteId);

      if (filteredNotes.length === notes.length) {
        throw new Error(`Note with ID ${noteId} not found`);
      }

      // Save updated list
      await this.storageService.setTaskNotes(filteredNotes);

      // Remove from cache
      this.notesCache.delete(noteId);

      this.errorHandler.logInfo('Note deleted successfully', 'deleteNote', { 
        noteId,
        taskId: noteToDelete?.taskId 
      });
    }, 'deleteNote', { noteId });
  }

  /**
   * Delete all notes for a specific task
   */
  async deleteNotesByTaskId(taskId: string): Promise<void> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getAllNotes();
      const notesToDelete = notes.filter(note => note.taskId === taskId);
      const filteredNotes = notes.filter(note => note.taskId !== taskId);

      // Save updated list
      await this.storageService.setTaskNotes(filteredNotes);

      // Remove from cache
      notesToDelete.forEach(note => {
        this.notesCache.delete(note.id);
      });

      this.errorHandler.logInfo(`Deleted ${notesToDelete.length} notes for task`, 'deleteNotesByTaskId', { 
        taskId,
        deletedCount: notesToDelete.length 
      });
    }, 'deleteNotesByTaskId', { taskId });
  }

  /**
   * Validate note field values against template
   */
  private validateNoteFieldValues(fieldValues: Record<string, any>, template: NoteTemplate): {
    isValid: boolean;
    errors: Record<string, string>;
    warnings: Record<string, string>;
  } {
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};

    // Check required fields
    template.fields.forEach(field => {
      const value = fieldValues[field.id];
      
      if (field.required && (value === undefined || value === null || value === '')) {
        errors[field.id] = `${field.label} is required`;
      }

      // Type-specific validation
      if (value !== undefined && value !== null && value !== '') {
        switch (field.type) {
          case 'number':
            if (isNaN(Number(value))) {
              errors[field.id] = `${field.label} must be a valid number`;
            } else {
              const numValue = Number(value);
              if (field.validation?.min !== undefined && numValue < field.validation.min) {
                errors[field.id] = `${field.label} must be at least ${field.validation.min}`;
              }
              if (field.validation?.max !== undefined && numValue > field.validation.max) {
                errors[field.id] = `${field.label} must be at most ${field.validation.max}`;
              }
            }
            break;
          case 'date':
            if (!(value instanceof Date) && isNaN(Date.parse(value))) {
              errors[field.id] = `${field.label} must be a valid date`;
            }
            break;
          case 'text':
            if (typeof value !== 'string') {
              errors[field.id] = `${field.label} must be text`;
            } else {
              if (field.validation?.min !== undefined && value.length < field.validation.min) {
                errors[field.id] = `${field.label} must be at least ${field.validation.min} characters`;
              }
              if (field.validation?.max !== undefined && value.length > field.validation.max) {
                errors[field.id] = `${field.label} must be at most ${field.validation.max} characters`;
              }
              if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
                errors[field.id] = `${field.label} format is invalid`;
              }
            }
            break;
          case 'checkbox':
            if (typeof value !== 'boolean') {
              errors[field.id] = `${field.label} must be a boolean`;
            }
            break;
          case 'select':
            if (
              typeof value !== 'string' ||
              !field.options?.some(option => option.value === value)
            ) {
              errors[field.id] = `${field.label} must be one of the available options`;
            }
            break;
        }
      }
    });

    // Check for orphaned field values (fields that don't exist in template)
    Object.keys(fieldValues).forEach(fieldId => {
      if (!template.fields.find(field => field.id === fieldId)) {
        warnings[fieldId] = 'This field no longer exists in the template';
      }
    });

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Archive a task note
   */
  async archiveNote(noteId: string): Promise<TaskNote> {
    return this.errorHandler.handleAsync(async () => {
      const now = new Date().toISOString();
      // Skip template validation for archive operations
      const archivedNote = await this.updateNoteInternal(noteId, {
        isArchived: true,
        archivedAt: now,
      }, false);

      this.errorHandler.logInfo('Note archived successfully', 'archiveNote', { noteId });
      return archivedNote;
    }, 'archiveNote', { noteId });
  }

  /**
   * Unarchive a task note
   */
  async unarchiveNote(noteId: string): Promise<TaskNote> {
    return this.errorHandler.handleAsync(async () => {
      // Skip template validation for unarchive operations
      const unarchivedNote = await this.updateNoteInternal(noteId, {
        isArchived: false,
        archivedAt: null,
      }, false);

      this.errorHandler.logInfo('Note unarchived successfully', 'unarchiveNote', { noteId });
      return unarchivedNote;
    }, 'unarchiveNote', { noteId });
  }

  /**
   * Get active (non-archived) notes by task ID
   */
  async getActiveNotesByTaskId(taskId: string): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getNotesByTaskId(taskId);
      const activeNotes = notes.filter(note => !note.isArchived);
      this.errorHandler.logInfo(`Found ${activeNotes.length} active notes for task`, 'getActiveNotesByTaskId', { taskId });
      return activeNotes;
    }, 'getActiveNotesByTaskId', { taskId });
  }

  /**
   * Get archived notes by task ID
   */
  async getArchivedNotesByTaskId(taskId: string): Promise<TaskNote[]> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getNotesByTaskId(taskId);
      const archivedNotes = notes.filter(note => note.isArchived);
      this.errorHandler.logInfo(`Found ${archivedNotes.length} archived notes for task`, 'getArchivedNotesByTaskId', { taskId });
      return archivedNotes;
    }, 'getArchivedNotesByTaskId', { taskId });
  }

  /**
   * Get notes statistics for a task
   */
  async getTaskNotesStats(taskId: string): Promise<{
    totalNotes: number;
    activeNotes: number;
    archivedNotes: number;
    templatesUsed: string[];
    lastNoteDate?: string;
  }> {
    return this.errorHandler.handleAsync(async () => {
      const notes = await this.getNotesByTaskId(taskId);
      const activeNotes = notes.filter(note => !note.isArchived);
      const archivedNotes = notes.filter(note => note.isArchived);
      const templatesUsed = [...new Set(notes.map(note => note.templateName))];
      const lastNote = notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

      const stats = {
        totalNotes: notes.length,
        activeNotes: activeNotes.length,
        archivedNotes: archivedNotes.length,
        templatesUsed,
        lastNoteDate: lastNote?.updatedAt,
      };

      this.errorHandler.logInfo('Generated task notes statistics', 'getTaskNotesStats', { 
        taskId,
        ...stats 
      });

      return stats;
    }, 'getTaskNotesStats', { taskId });
  }
}
