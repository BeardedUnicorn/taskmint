/**
 * Notes Integration Tests
 * 
 * Integration tests for the templated notes feature including
 * template management, note creation, and task integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NoteTemplateService } from '../../services/NoteTemplateService';
import { TaskNotesService } from '../../services/TaskNotesService';
import { StorageService } from '../../services/StorageService';

describe('Notes Integration', () => {
  let templateService: NoteTemplateService;
  let notesService: TaskNotesService;
  let storageService: StorageService;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Get fresh service instances
    templateService = NoteTemplateService.getInstance();
    notesService = TaskNotesService.getInstance();
    storageService = StorageService.getInstance();
  });

  describe('Template Management', () => {
    it('should create a new template', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'A test template',
        fields: [
          {
            id: 'field1',
            label: 'Test Field',
            type: 'text' as const,
            required: true,
            order: 0,
          },
        ],
        isActive: true,
      };

      const template = await templateService.createTemplate(templateData);

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Test Template');
      expect(template.fields).toHaveLength(1);
      expect(template.isActive).toBe(true);
    });

    it('should retrieve all templates', async () => {
      // Create a template first
      await templateService.createTemplate({
        name: 'Template 1',
        fields: [],
        isActive: true,
      });

      const templates = await templateService.getAllTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Template 1');
    });

    it('should update a template', async () => {
      const template = await templateService.createTemplate({
        name: 'Original Name',
        fields: [],
        isActive: true,
      });

      const updated = await templateService.updateTemplate(template.id, {
        name: 'Updated Name',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.id).toBe(template.id);
    });

    it('should delete a template', async () => {
      const template = await templateService.createTemplate({
        name: 'To Delete',
        fields: [],
        isActive: true,
      });

      await templateService.deleteTemplate(template.id);

      const templates = await templateService.getAllTemplates();
      expect(templates).toHaveLength(0);
    });
  });

  describe('Task Notes Management', () => {
    let templateId: string;
    const taskId = 'test-task-1';

    beforeEach(async () => {
      // Create a template for testing notes
      const template = await templateService.createTemplate({
        name: 'Note Template',
        fields: [
          {
            id: 'field1',
            label: 'Description',
            type: 'text' as const,
            required: true,
            order: 0,
          },
          {
            id: 'field2',
            label: 'Priority',
            type: 'number' as const,
            required: false,
            order: 1,
          },
        ],
        isActive: true,
      });
      templateId = template.id;
    });

    it('should create a task note', async () => {
      const noteData = {
        taskId,
        templateId,
        templateName: 'Note Template',
        fieldValues: {
          field1: 'Test description',
          field2: 5,
        },
      };

      const note = await notesService.createNote(noteData);

      expect(note.id).toBeDefined();
      expect(note.taskId).toBe(taskId);
      expect(note.templateId).toBe(templateId);
      expect(note.fieldValues.field1).toBe('Test description');
      expect(note.fieldValues.field2).toBe(5);
    });

    it('should retrieve notes by task ID', async () => {
      // Create two notes for the same task
      await notesService.createNote({
        taskId,
        templateId,
        templateName: 'Note Template',
        fieldValues: { field1: 'Note 1' },
      });

      await notesService.createNote({
        taskId,
        templateId,
        templateName: 'Note Template',
        fieldValues: { field1: 'Note 2' },
      });

      // Create a note for a different task
      await notesService.createNote({
        taskId: 'other-task',
        templateId,
        templateName: 'Note Template',
        fieldValues: { field1: 'Other note' },
      });

      const taskNotes = await notesService.getNotesByTaskId(taskId);
      expect(taskNotes).toHaveLength(2);
      expect(taskNotes.every(note => note.taskId === taskId)).toBe(true);
    });

    it('should update a task note', async () => {
      const note = await notesService.createNote({
        taskId,
        templateId,
        templateName: 'Note Template',
        fieldValues: { field1: 'Original' },
      });

      const updated = await notesService.updateNote(note.id, {
        fieldValues: { field1: 'Updated' },
      });

      expect(updated.fieldValues.field1).toBe('Updated');
      expect(updated.id).toBe(note.id);
    });

    it('should delete a task note', async () => {
      const note = await notesService.createNote({
        taskId,
        templateId,
        templateName: 'Note Template',
        fieldValues: { field1: 'To delete' },
      });

      await notesService.deleteNote(note.id);

      const notes = await notesService.getNotesByTaskId(taskId);
      expect(notes).toHaveLength(0);
    });

    it('should delete all notes for a task', async () => {
      // Create multiple notes for the task
      await notesService.createNote({
        taskId,
        templateId,
        templateName: 'Note Template',
        fieldValues: { field1: 'Note 1' },
      });

      await notesService.createNote({
        taskId,
        templateId,
        templateName: 'Note Template',
        fieldValues: { field1: 'Note 2' },
      });

      await notesService.deleteNotesByTaskId(taskId);

      const notes = await notesService.getNotesByTaskId(taskId);
      expect(notes).toHaveLength(0);
    });
  });

  describe('Data Persistence', () => {
    it('should persist templates in localStorage', async () => {
      const template = await templateService.createTemplate({
        name: 'Persistent Template',
        fields: [],
        isActive: true,
      });

      // Create a new service instance to test persistence
      const newTemplateService = NoteTemplateService.getInstance();
      const templates = await newTemplateService.getAllTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe(template.id);
      expect(templates[0].name).toBe('Persistent Template');
    });

    it('should persist notes in localStorage', async () => {
      const template = await templateService.createTemplate({
        name: 'Test Template',
        fields: [],
        isActive: true,
      });

      const note = await notesService.createNote({
        taskId: 'test-task',
        templateId: template.id,
        templateName: template.name,
        fieldValues: { test: 'value' },
      });

      // Create a new service instance to test persistence
      const newNotesService = TaskNotesService.getInstance();
      const notes = await newNotesService.getAllNotes();

      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(note.id);
      expect(notes[0].fieldValues.test).toBe('value');
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const template = await templateService.createTemplate({
        name: 'Validation Template',
        fields: [
          {
            id: 'required-field',
            label: 'Required Field',
            type: 'text' as const,
            required: true,
            order: 0,
          },
        ],
        isActive: true,
      });

      // Try to create a note without the required field
      await expect(
        notesService.createNote({
          taskId: 'test-task',
          templateId: template.id,
          templateName: template.name,
          fieldValues: {}, // Empty field values
        })
      ).rejects.toThrow();
    });

    it('should validate field types', async () => {
      const template = await templateService.createTemplate({
        name: 'Type Validation Template',
        fields: [
          {
            id: 'number-field',
            label: 'Number Field',
            type: 'number' as const,
            required: true,
            order: 0,
          },
        ],
        isActive: true,
      });

      // Try to create a note with invalid number value
      await expect(
        notesService.createNote({
          taskId: 'test-task',
          templateId: template.id,
          templateName: template.name,
          fieldValues: {
            'number-field': 'not-a-number',
          },
        })
      ).rejects.toThrow();
    });
  });
});
