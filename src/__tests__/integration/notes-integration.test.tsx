/**
 * Notes Integration Tests
 * 
 * Integration tests for the templated notes feature including
 * template management, note creation, and task integration.
 */
import { NoteTemplateService } from '../../services/NoteTemplateService';
import { TaskNotesService } from '../../services/TaskNotesService';
import { StorageService } from '../../services/StorageService';
import { describe, it, beforeEach, expect } from 'vitest';

describe('Notes Integration', () => {
  let templateService: NoteTemplateService;
  let notesService: TaskNotesService;
  let storageService: StorageService;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Reset singletons to avoid cross-test contamination
    (NoteTemplateService as any).instance = undefined;
    (TaskNotesService as any).instance = undefined;
    (StorageService as any).instance = undefined;

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
      // Includes default free-form template plus the created one
      expect(templates.length).toBe(2);
      expect(templates.some(t => t.name === 'Template 1')).toBe(true);
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
      // Free-form template remains after deletion
      expect(templates.length).toBe(1);
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

      // Should include default free-form template plus the persisted one
      expect(templates.length).toBe(2);
      const persisted = templates.find(t => t.id === template.id);
      expect(persisted).toBeDefined();
      expect(persisted?.name).toBe('Persistent Template');
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

  describe('Field Types Support', () => {
    it('loads templates saved with legacy command fields as text fields', async () => {
      // A template stored before command fields were removed.
      localStorage.setItem('noteTemplates', JSON.stringify([
        {
          id: 'legacy-template',
          name: 'Command Template',
          fields: [
            {
              id: 'command-field',
              label: 'Command Output',
              type: 'command',
              required: false,
              order: 0,
              command: 'echo "Hello World"',
            },
          ],
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]));

      const [template] = await templateService.getAllTemplates();
      expect(template.fields[0].type).toBe('text');
      expect(template.fields[0]).not.toHaveProperty('command');

      const note = await notesService.createNote({
        taskId: 'test-task',
        templateId: template.id,
        templateName: template.name,
        fieldValues: {
          'command-field': 'Hello World',
        },
      });
      expect(note.fieldValues['command-field']).toBe('Hello World');
    });

    it('should support all field types', async () => {
      const template = await templateService.createTemplate({
        name: 'All Types Template',
        fields: [
          {
            id: 'text-field',
            label: 'Text Field',
            type: 'text' as const,
            required: false,
            order: 0,
          },
          {
            id: 'number-field',
            label: 'Number Field',
            type: 'number' as const,
            required: false,
            order: 1,
          },
          {
            id: 'date-field',
            label: 'Date Field',
            type: 'date' as const,
            required: false,
            order: 2,
          },
          {
            id: 'checkbox-field',
            label: 'Checkbox Field',
            type: 'checkbox' as const,
            required: false,
            order: 4,
          },
          {
            id: 'select-field',
            label: 'Select Field',
            type: 'select' as const,
            required: false,
            order: 5,
            options: [
              { label: 'Option 1', value: 'opt1' },
              { label: 'Option 2', value: 'opt2' },
            ],
          },
        ],
        isActive: true,
      });

      const note = await notesService.createNote({
        taskId: 'test-task',
        templateId: template.id,
        templateName: template.name,
        fieldValues: {
          'text-field': 'Sample text',
          'number-field': 42,
          'date-field': '2024-01-01',
          'checkbox-field': true,
          'select-field': 'opt1',
        },
      });

      expect(note.fieldValues['text-field']).toBe('Sample text');
      expect(note.fieldValues['number-field']).toBe(42);
      expect(note.fieldValues['date-field']).toBe('2024-01-01');
      expect(note.fieldValues['checkbox-field']).toBe(true);
      expect(note.fieldValues['select-field']).toBe('opt1');
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
