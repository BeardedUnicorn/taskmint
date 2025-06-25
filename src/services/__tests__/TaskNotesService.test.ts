/**
 * Tests for TaskNotesService
 */

import { TaskNotesService } from '../TaskNotesService';
import { StorageService } from '../StorageService';
import { NoteTemplateService } from '../NoteTemplateService';
import { TaskNote, NoteTemplate, TaskNoteSchema } from '../../types/notes';
import { validateWithSchema } from '../../utils/validation';

// Mock dependencies
jest.mock('../StorageService');
jest.mock('../NoteTemplateService');
jest.mock('../../utils/validation');

describe('TaskNotesService', () => {
  let taskNotesService: TaskNotesService;
  let mockStorageService: jest.Mocked<StorageService>;
  let mockTemplateService: jest.Mocked<NoteTemplateService>;
  let mockValidateWithSchema: jest.MockedFunction<typeof validateWithSchema>;

  const mockTemplate: NoteTemplate = {
    id: 'template_1',
    name: 'Test Template',
    description: 'A test template',
    fields: [
      {
        id: 'field_1',
        label: 'Text Field',
        type: 'text',
        required: true,
        order: 0,
        validation: { min: 1, max: 100 },
      },
      {
        id: 'field_2',
        label: 'Number Field',
        type: 'number',
        required: false,
        order: 1,
        validation: { min: 0, max: 100 },
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    isActive: true,
  };

  const mockNote: TaskNote = {
    id: 'note_1',
    taskId: 'task_1',
    templateId: 'template_1',
    templateName: 'Test Template',
    fieldValues: {
      field_1: 'Test value',
      field_2: 42,
    },
    timeEntryId: 'entry_1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    // Reset singleton instance
    (TaskNotesService as any).instance = undefined;
    taskNotesService = TaskNotesService.getInstance();
    
    // Setup mocks
    mockStorageService = {
      getTaskNotes: jest.fn(),
      setTaskNotes: jest.fn(),
    } as any;
    
    mockTemplateService = {
      getTemplateById: jest.fn(),
    } as any;
    
    (StorageService.getInstance as jest.Mock).mockReturnValue(mockStorageService);
    (NoteTemplateService.getInstance as jest.Mock).mockReturnValue(mockTemplateService);
    
    mockValidateWithSchema = validateWithSchema as jest.MockedFunction<typeof validateWithSchema>;
    mockValidateWithSchema.mockReturnValue({ success: true, data: mockNote });
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = TaskNotesService.getInstance();
      const instance2 = TaskNotesService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getAllNotes', () => {
    it('should return all notes and update cache', async () => {
      const notes = [mockNote];
      mockStorageService.getTaskNotes.mockResolvedValue(notes);
      
      const result = await taskNotesService.getAllNotes();
      
      expect(result).toEqual(notes);
      expect(mockStorageService.getTaskNotes).toHaveBeenCalled();
      
      // Verify cache is updated
      const cachedNote = await taskNotesService.getNoteById('note_1');
      expect(cachedNote).toEqual(mockNote);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      await expect(taskNotesService.getAllNotes())
        .rejects.toThrow('Failed to load task notes');
    });
  });

  describe('getNotesByTaskId', () => {
    it('should return notes filtered by task ID', async () => {
      const notes = [
        mockNote,
        { ...mockNote, id: 'note_2', taskId: 'task_2' },
      ];
      mockStorageService.getTaskNotes.mockResolvedValue(notes);
      
      const result = await taskNotesService.getNotesByTaskId('task_1');
      
      expect(result).toEqual([mockNote]);
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      const result = await taskNotesService.getNotesByTaskId('task_1');
      
      expect(result).toEqual([]);
    });
  });

  describe('getNotesByTimeEntryId', () => {
    it('should return notes filtered by time entry ID', async () => {
      const notes = [
        mockNote,
        { ...mockNote, id: 'note_2', timeEntryId: 'entry_2' },
      ];
      mockStorageService.getTaskNotes.mockResolvedValue(notes);
      
      const result = await taskNotesService.getNotesByTimeEntryId('entry_1');
      
      expect(result).toEqual([mockNote]);
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      const result = await taskNotesService.getNotesByTimeEntryId('entry_1');
      
      expect(result).toEqual([]);
    });
  });

  describe('getNoteById', () => {
    it('should return note from cache if available', async () => {
      // First load notes to populate cache
      mockStorageService.getTaskNotes.mockResolvedValue([mockNote]);
      await taskNotesService.getAllNotes();
      
      // Clear mock calls
      mockStorageService.getTaskNotes.mockClear();
      
      const result = await taskNotesService.getNoteById('note_1');
      
      expect(result).toEqual(mockNote);
      expect(mockStorageService.getTaskNotes).not.toHaveBeenCalled();
    });

    it('should load from storage if not in cache', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([mockNote]);
      
      const result = await taskNotesService.getNoteById('note_1');
      
      expect(result).toEqual(mockNote);
      expect(mockStorageService.getTaskNotes).toHaveBeenCalled();
    });

    it('should return null if note not found', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([]);
      
      const result = await taskNotesService.getNoteById('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      const result = await taskNotesService.getNoteById('note_1');
      
      expect(result).toBeNull();
    });
  });

  describe('createNote', () => {
    const noteData = {
      taskId: 'task_1',
      templateId: 'template_1',
      templateName: 'Test Template',
      fieldValues: {
        field_1: 'Test value',
        field_2: 42,
      },
      timeEntryId: 'entry_1',
    };

    it('should create a new note successfully', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mockTemplate);
      mockStorageService.getTaskNotes.mockResolvedValue([]);
      mockStorageService.setTaskNotes.mockResolvedValue();
      
      const result = await taskNotesService.createNote(noteData);
      
      expect(result).toMatchObject({
        taskId: noteData.taskId,
        templateId: noteData.templateId,
        templateName: mockTemplate.name,
        fieldValues: noteData.fieldValues,
        timeEntryId: noteData.timeEntryId,
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      
      expect(mockTemplateService.getTemplateById).toHaveBeenCalledWith('template_1');
      expect(mockValidateWithSchema).toHaveBeenCalledWith(TaskNoteSchema, result);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalled();
    });

    it('should throw error if template not found', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(null);
      
      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Template with ID template_1 not found');
    });

    it('should validate field values against template', async () => {
      const invalidNoteData = {
        ...noteData,
        fieldValues: {
          field_1: '', // Required field is empty
          field_2: 'not a number',
        },
      };
      
      mockTemplateService.getTemplateById.mockResolvedValue(mockTemplate);
      
      await expect(taskNotesService.createNote(invalidNoteData))
        .rejects.toThrow('Note validation failed');
    });

    it('should handle schema validation errors', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mockTemplate);
      mockStorageService.getTaskNotes.mockResolvedValue([]);
      mockValidateWithSchema.mockReturnValue({ 
        success: false, 
        error: 'Schema validation failed' 
      });
      
      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Note schema validation failed: Schema validation failed');
    });

    it('should handle storage errors', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mockTemplate);
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Failed to create task note');
    });
  });

  describe('updateNote', () => {
    const updates = {
      fieldValues: {
        field_1: 'Updated value',
        field_2: 84,
      },
    };

    it('should update note successfully', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([mockNote]);
      mockTemplateService.getTemplateById.mockResolvedValue(mockTemplate);
      mockStorageService.setTaskNotes.mockResolvedValue();
      
      const result = await taskNotesService.updateNote('note_1', updates);
      
      expect(result).toMatchObject({
        ...mockNote,
        ...updates,
        id: 'note_1', // ID should not change
        templateName: mockTemplate.name,
      });
      expect(result.updatedAt).not.toBe(mockNote.updatedAt);
      
      expect(mockValidateWithSchema).toHaveBeenCalledWith(TaskNoteSchema, result);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalled();
    });

    it('should throw error if note not found', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([]);
      
      await expect(taskNotesService.updateNote('nonexistent', updates))
        .rejects.toThrow('Note with ID nonexistent not found');
    });

    it('should validate template when template ID is updated', async () => {
      const templateUpdates = { templateId: 'template_2' };
      
      mockStorageService.getTaskNotes.mockResolvedValue([mockNote]);
      mockTemplateService.getTemplateById.mockResolvedValue(null);
      
      await expect(taskNotesService.updateNote('note_1', templateUpdates))
        .rejects.toThrow('Template with ID template_2 not found');
    });

    it('should validate field values when updated', async () => {
      const invalidUpdates = {
        fieldValues: {
          field_1: '', // Required field is empty
        },
      };
      
      mockStorageService.getTaskNotes.mockResolvedValue([mockNote]);
      mockTemplateService.getTemplateById.mockResolvedValue(mockTemplate);
      
      await expect(taskNotesService.updateNote('note_1', invalidUpdates))
        .rejects.toThrow('Note validation failed');
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      await expect(taskNotesService.updateNote('note_1', updates))
        .rejects.toThrow('Failed to update task note');
    });
  });

  describe('deleteNote', () => {
    it('should delete note successfully', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([mockNote]);
      mockStorageService.setTaskNotes.mockResolvedValue();
      
      await taskNotesService.deleteNote('note_1');
      
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledWith([]);
    });

    it('should throw error if note not found', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([]);
      
      await expect(taskNotesService.deleteNote('nonexistent'))
        .rejects.toThrow('Note with ID nonexistent not found');
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      await expect(taskNotesService.deleteNote('note_1'))
        .rejects.toThrow('Failed to delete task note');
    });
  });

  describe('deleteNotesByTaskId', () => {
    it('should delete all notes for a task', async () => {
      const notes = [
        mockNote,
        { ...mockNote, id: 'note_2', taskId: 'task_2' },
      ];
      mockStorageService.getTaskNotes.mockResolvedValue(notes);
      mockStorageService.setTaskNotes.mockResolvedValue();
      
      await taskNotesService.deleteNotesByTaskId('task_1');
      
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledWith([
        { ...mockNote, id: 'note_2', taskId: 'task_2' },
      ]);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTaskNotes.mockRejectedValue(new Error('Storage error'));
      
      await expect(taskNotesService.deleteNotesByTaskId('task_1'))
        .rejects.toThrow('Failed to delete task notes');
    });
  });

  describe('getTaskNotesStats', () => {
    it('should return correct statistics', async () => {
      const notes = [
        mockNote,
        { ...mockNote, id: 'note_2', templateName: 'Another Template', updatedAt: '2024-01-02T00:00:00.000Z' },
      ];
      mockStorageService.getTaskNotes.mockResolvedValue(notes);

      const result = await taskNotesService.getTaskNotesStats('task_1');

      expect(result).toEqual({
        totalNotes: 2,
        templatesUsed: ['Test Template', 'Another Template'],
        lastNoteDate: '2024-01-02T00:00:00.000Z',
      });
    });

    it('should handle empty notes', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([]);

      const result = await taskNotesService.getTaskNotesStats('task_1');

      expect(result).toEqual({
        totalNotes: 0,
        templatesUsed: [],
        lastNoteDate: undefined,
      });
    });
  });

  describe('field validation', () => {
    const validationTemplate: NoteTemplate = {
      ...mockTemplate,
      fields: [
        {
          id: 'text_field',
          label: 'Text Field',
          type: 'text',
          required: true,
          order: 0,
          validation: { min: 2, max: 10, pattern: '^[A-Za-z]+$' },
        },
        {
          id: 'number_field',
          label: 'Number Field',
          type: 'number',
          required: false,
          order: 1,
          validation: { min: 0, max: 100 },
        },
        {
          id: 'date_field',
          label: 'Date Field',
          type: 'date',
          required: false,
          order: 2,
        },
        {
          id: 'checkbox_field',
          label: 'Checkbox Field',
          type: 'checkbox',
          required: false,
          order: 3,
        },
      ],
    };

    it('should validate required fields', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: '', // Required field is empty
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);

      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Note validation failed: Text Field is required');
    });

    it('should validate text field constraints', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: 'a', // Too short (min: 2)
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);

      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Note validation failed: Text Field must be at least 2 characters');
    });

    it('should validate text field pattern', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: 'abc123', // Contains numbers, pattern allows only letters
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);

      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Note validation failed: Text Field format is invalid');
    });

    it('should validate number field constraints', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: 'valid',
          number_field: 150, // Exceeds max (100)
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);

      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Note validation failed: Number Field must be at most 100');
    });

    it('should validate number field type', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: 'valid',
          number_field: 'not a number',
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);

      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Note validation failed: Number Field must be a valid number');
    });

    it('should validate date field', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: 'valid',
          date_field: 'invalid date',
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);

      await expect(taskNotesService.createNote(noteData))
        .rejects.toThrow('Note validation failed: Date Field must be a valid date');
    });

    it('should accept valid field values', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: 'valid',
          number_field: 50,
          date_field: '2024-01-01',
          checkbox_field: true,
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);
      mockStorageService.getTaskNotes.mockResolvedValue([]);
      mockStorageService.setTaskNotes.mockResolvedValue();

      const result = await taskNotesService.createNote(noteData);

      expect(result.fieldValues).toEqual(noteData.fieldValues);
    });

    it('should warn about orphaned field values', async () => {
      const noteData = {
        taskId: 'task_1',
        templateId: 'template_1',
        templateName: 'Test Template',
        fieldValues: {
          text_field: 'valid',
          orphaned_field: 'this field no longer exists in template',
        },
      };

      mockTemplateService.getTemplateById.mockResolvedValue(validationTemplate);
      mockStorageService.getTaskNotes.mockResolvedValue([]);
      mockStorageService.setTaskNotes.mockResolvedValue();

      // Should not throw error for warnings, only for validation errors
      const result = await taskNotesService.createNote(noteData);

      expect(result.fieldValues).toEqual(noteData.fieldValues);
    });
  });
});
