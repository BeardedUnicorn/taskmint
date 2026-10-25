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
import { validateFieldValues } from '../utils/noteFields';
import { createServiceErrorHandler } from '../utils/errorHandler';

export class TaskNotesService {
  private static instance: TaskNotesService;
  private storageService: StorageService;
  private templateService: NoteTemplateService;
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
      this.errorHandler.logInfo(`Loaded ${notes.length} notes`, 'getAllNotes');
      return notes;
    }, 'getAllNotes');
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

      this.errorHandler.logInfo('Note deleted successfully', 'deleteNote', { 
        noteId,
        taskId: noteToDelete?.taskId 
      });
    }, 'deleteNote', { noteId });
  }

  /**
   * Validate note field values against template
   */
  private validateNoteFieldValues(fieldValues: Record<string, any>, template: NoteTemplate): {
    isValid: boolean;
    errors: Record<string, string>;
    warnings: Record<string, string>;
  } {
    // The editor applies the same rules (utils/noteFields)
    const errors = validateFieldValues(template.fields, fieldValues);
    const warnings: Record<string, string> = {};

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
}
