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

export class TaskNotesService {
  private static instance: TaskNotesService;
  private storageService: StorageService;
  private templateService: NoteTemplateService;
  private notesCache = new Map<string, TaskNote>();

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
    try {
      const notes = await this.storageService.getTaskNotes();
      
      // Update cache
      this.notesCache.clear();
      notes.forEach(note => {
        this.notesCache.set(note.id, note);
      });

      return notes;
    } catch (error) {
      console.error('Failed to get task notes:', error);
      throw new Error('Failed to load task notes');
    }
  }

  /**
   * Get notes by task ID
   */
  async getNotesByTaskId(taskId: string): Promise<TaskNote[]> {
    try {
      const notes = await this.getAllNotes();
      return notes.filter(note => note.taskId === taskId);
    } catch (error) {
      console.error(`Failed to get notes for task ${taskId}:`, error);
      return [];
    }
  }

  /**
   * Get notes by time entry ID
   */
  async getNotesByTimeEntryId(timeEntryId: string): Promise<TaskNote[]> {
    try {
      const notes = await this.getAllNotes();
      return notes.filter(note => note.timeEntryId === timeEntryId);
    } catch (error) {
      console.error(`Failed to get notes for time entry ${timeEntryId}:`, error);
      return [];
    }
  }

  /**
   * Get note by ID
   */
  async getNoteById(noteId: string): Promise<TaskNote | null> {
    try {
      // Check cache first
      if (this.notesCache.has(noteId)) {
        return this.notesCache.get(noteId)!;
      }

      // Load from storage
      const notes = await this.getAllNotes();
      return notes.find(note => note.id === noteId) || null;
    } catch (error) {
      console.error(`Failed to get note ${noteId}:`, error);
      return null;
    }
  }

  /**
   * Create a new task note
   */
  async createNote(noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskNote> {
    try {
      // Validate template exists
      const template = await this.templateService.getTemplateById(noteData.templateId);
      if (!template) {
        throw new Error(`Template with ID ${noteData.templateId} not found`);
      }

      // Validate field values against template
      const validationResult = this.validateNoteFieldValues(noteData.fieldValues, template);
      if (!validationResult.isValid) {
        throw new Error(`Note validation failed: ${Object.values(validationResult.errors).join(', ')}`);
      }

      const now = new Date().toISOString();
      const newNote: TaskNote = {
        ...noteData,
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        templateName: template.name, // Cache template name
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
      return newNote;
    } catch (error) {
      // Only log errors in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to create note:', error);
      }
      throw new Error('Failed to create task note');
    }
  }

  /**
   * Update an existing task note
   */
  async updateNote(noteId: string, updates: Partial<TaskNote>): Promise<TaskNote> {
    try {
      const notes = await this.getAllNotes();
      const noteIndex = notes.findIndex(note => note.id === noteId);

      if (noteIndex === -1) {
        throw new Error(`Note with ID ${noteId} not found`);
      }

      const existingNote = notes[noteIndex];

      // If template is being changed, validate the new template
      const templateId = updates.templateId || existingNote.templateId;
      const template = await this.templateService.getTemplateById(templateId);
      if (!template) {
        throw new Error(`Template with ID ${templateId} not found`);
      }

      // Apply updates
      const updatedNote: TaskNote = {
        ...existingNote,
        ...updates,
        id: noteId, // Ensure ID doesn't change
        templateName: template.name, // Update cached template name
        updatedAt: new Date().toISOString(),
      };

      // Validate field values if they were updated
      if (updates.fieldValues) {
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

      return updatedNote;
    } catch (error) {
      console.error(`Failed to update note ${noteId}:`, error);
      throw new Error('Failed to update task note');
    }
  }

  /**
   * Delete a task note
   */
  async deleteNote(noteId: string): Promise<void> {
    try {
      const notes = await this.getAllNotes();
      const filteredNotes = notes.filter(note => note.id !== noteId);

      if (filteredNotes.length === notes.length) {
        throw new Error(`Note with ID ${noteId} not found`);
      }

      // Save updated list
      await this.storageService.setTaskNotes(filteredNotes);

      // Remove from cache
      this.notesCache.delete(noteId);
    } catch (error) {
      console.error(`Failed to delete note ${noteId}:`, error);
      throw new Error('Failed to delete task note');
    }
  }

  /**
   * Delete all notes for a specific task
   */
  async deleteNotesByTaskId(taskId: string): Promise<void> {
    try {
      const notes = await this.getAllNotes();
      const filteredNotes = notes.filter(note => note.taskId !== taskId);

      // Save updated list
      await this.storageService.setTaskNotes(filteredNotes);

      // Remove from cache
      notes.forEach(note => {
        if (note.taskId === taskId) {
          this.notesCache.delete(note.id);
        }
      });
    } catch (error) {
      console.error(`Failed to delete notes for task ${taskId}:`, error);
      throw new Error('Failed to delete task notes');
    }
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
   * Get notes statistics for a task
   */
  async getTaskNotesStats(taskId: string): Promise<{
    totalNotes: number;
    templatesUsed: string[];
    lastNoteDate?: string;
  }> {
    const notes = await this.getNotesByTaskId(taskId);
    const templatesUsed = [...new Set(notes.map(note => note.templateName))];
    const lastNote = notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

    return {
      totalNotes: notes.length,
      templatesUsed,
      lastNoteDate: lastNote?.updatedAt,
    };
  }
}
