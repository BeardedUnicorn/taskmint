/**
 * TaskNotesService Tests
 * 
 * Tests for the TaskNotesService including archive functionality
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TaskNotesService } from '../TaskNotesService';
import { NoteTemplateService } from '../NoteTemplateService';
import { StorageService } from '../StorageService';
import { TaskNote, NoteTemplate } from '../../types/notes';

// Mock the dependencies
vi.mock('../StorageService', () => ({
  StorageService: {
    getInstance: vi.fn(),
  },
}));
vi.mock('../NoteTemplateService', () => ({
  NoteTemplateService: {
    getInstance: vi.fn(),
  },
}));

describe('TaskNotesService', () => {
  let service: TaskNotesService;
  let mockStorageService: vi.Mocked<StorageService>;
  let mockTemplateService: vi.Mocked<NoteTemplateService>;

  const mockTemplate: NoteTemplate = {
    id: 'template1',
    name: 'Test Template',
    description: 'A test template',
    fields: [
      {
        id: 'field1',
        label: 'Test Field',
        type: 'text',
        required: true,
        order: 0,
      },
    ],
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    isActive: true,
  };

  const mockNote: TaskNote = {
    id: 'note1',
    taskId: 'task1',
    templateId: 'template1',
    templateName: 'Test Template',
    fieldValues: { field1: 'Test value' },
    timeEntryId: null,
    isArchived: false,
    archivedAt: null,
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock instances with proper typings
    mockStorageService = {
      getTaskNotes: vi.fn().mockResolvedValue([mockNote]),
      setTaskNotes: vi.fn().mockResolvedValue(),
    } as unknown as vi.Mocked<StorageService>;
    mockTemplateService = {
      getTemplateById: vi.fn().mockResolvedValue(mockTemplate),
    } as unknown as vi.Mocked<NoteTemplateService>;

    // Mock the static getInstance methods
    vi.mocked(StorageService.getInstance).mockReturnValue(mockStorageService);
    vi.mocked(NoteTemplateService.getInstance).mockReturnValue(mockTemplateService);

    // Create service instance after mocking
    service = new TaskNotesService();
  });

  describe('validateNoteFieldValues', () => {
    it('should validate checkbox fields', () => {
      const template: NoteTemplate = {
        ...mockTemplate,
        fields: [
          {
            id: 'check',
            label: 'Done',
            type: 'checkbox',
            required: true,
            order: 0,
          },
        ],
      };

      const valid = (service as any).validateNoteFieldValues({ check: true }, template);
      expect(valid.isValid).toBe(true);

      const invalid = (service as any).validateNoteFieldValues({ check: 'yes' }, template);
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.check).toBe('Done must be a boolean');
    });

    it('should validate select fields', () => {
      const template: NoteTemplate = {
        ...mockTemplate,
        fields: [
          {
            id: 'color',
            label: 'Color',
            type: 'select',
            required: true,
            order: 0,
            options: [
              { label: 'Red', value: 'red' },
              { label: 'Blue', value: 'blue' },
            ],
          },
        ],
      };

      const valid = (service as any).validateNoteFieldValues({ color: 'red' }, template);
      expect(valid.isValid).toBe(true);

      const invalid = (service as any).validateNoteFieldValues({ color: 'green' }, template);
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.color).toBe('Color must be one of the available options');
    });
  });

  describe('Archive functionality', () => {
    it('should archive a note successfully', async () => {
      const noteId = 'note1';
      const expectedArchivedNote = {
        ...mockNote,
        isArchived: true,
        archivedAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const result = await service.archiveNote(noteId);

      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toBeTruthy();
      expect(result.updatedAt).not.toBe(mockNote.updatedAt);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledWith([expectedArchivedNote]);
    });

    it('should unarchive a note successfully', async () => {
      const archivedNote = {
        ...mockNote,
        isArchived: true,
        archivedAt: '2023-01-02T00:00:00.000Z',
      };
      mockStorageService.getTaskNotes.mockResolvedValue([archivedNote]);

      const noteId = 'note1';
      const expectedUnarchivedNote = {
        ...archivedNote,
        isArchived: false,
        archivedAt: null,
        updatedAt: expect.any(String),
      };

      const result = await service.unarchiveNote(noteId);

      expect(result.isArchived).toBe(false);
      expect(result.archivedAt).toBe(null);
      expect(result.updatedAt).not.toBe(archivedNote.updatedAt);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledWith([expectedUnarchivedNote]);
    });

    it('should throw error when archiving non-existent note', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([]);

      await expect(service.archiveNote('nonexistent')).rejects.toThrow('Note with ID nonexistent not found');
    });

    it('should throw error when unarchiving non-existent note', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([]);

      await expect(service.unarchiveNote('nonexistent')).rejects.toThrow('Note with ID nonexistent not found');
    });
  });

  describe('getActiveNotesByTaskId', () => {
    it('should return only non-archived notes for a task', async () => {
      const activeNote = { ...mockNote, id: 'note1', isArchived: false };
      const archivedNote = { ...mockNote, id: 'note2', isArchived: true };
      mockStorageService.getTaskNotes.mockResolvedValue([activeNote, archivedNote]);

      const result = await service.getActiveNotesByTaskId('task1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('note1');
      expect(result[0].isArchived).toBe(false);
    });

    it('should return empty array when no active notes exist', async () => {
      const archivedNote = { ...mockNote, isArchived: true };
      mockStorageService.getTaskNotes.mockResolvedValue([archivedNote]);

      const result = await service.getActiveNotesByTaskId('task1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getArchivedNotesByTaskId', () => {
    it('should return only archived notes for a task', async () => {
      const activeNote = { ...mockNote, id: 'note1', isArchived: false };
      const archivedNote = { ...mockNote, id: 'note2', isArchived: true };
      mockStorageService.getTaskNotes.mockResolvedValue([activeNote, archivedNote]);

      const result = await service.getArchivedNotesByTaskId('task1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('note2');
      expect(result[0].isArchived).toBe(true);
    });

    it('should return empty array when no archived notes exist', async () => {
      const activeNote = { ...mockNote, isArchived: false };
      mockStorageService.getTaskNotes.mockResolvedValue([activeNote]);

      const result = await service.getArchivedNotesByTaskId('task1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getTaskNotesStats', () => {
    it('should return correct stats including archive counts', async () => {
      const activeNote1 = { ...mockNote, id: 'note1', isArchived: false };
      const activeNote2 = { ...mockNote, id: 'note2', isArchived: false };
      const archivedNote = { ...mockNote, id: 'note3', isArchived: true };
      mockStorageService.getTaskNotes.mockResolvedValue([activeNote1, activeNote2, archivedNote]);

      const result = await service.getTaskNotesStats('task1');

      expect(result.totalNotes).toBe(3);
      expect(result.activeNotes).toBe(2);
      expect(result.archivedNotes).toBe(1);
      expect(result.templatesUsed).toEqual(['Test Template']);
    });

    it('should handle task with no notes', async () => {
      mockStorageService.getTaskNotes.mockResolvedValue([]);

      const result = await service.getTaskNotesStats('task1');

      expect(result.totalNotes).toBe(0);
      expect(result.activeNotes).toBe(0);
      expect(result.archivedNotes).toBe(0);
      expect(result.templatesUsed).toEqual([]);
      expect(result.lastNoteDate).toBeUndefined();
    });
  });

  describe('addNotes', () => {
    const moved = (id: string, overrides: Partial<TaskNote> = {}): TaskNote => ({
      ...mockNote,
      id,
      templateId: 'free-form',
      templateName: 'Free-form Note',
      fieldValues: { content: 'moved text' },
      ...overrides,
    });

    it('adds new notes in one write and returns them', async () => {
      const added = await service.addNotes([moved('a'), moved('b')]);

      expect(added.map(note => note.id)).toEqual(['a', 'b']);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledTimes(1);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledWith([mockNote, ...added]);
    });

    it('skips ids already stored and notes that fail the schema', async () => {
      const added = await service.addNotes([
        moved('note1'), // already stored
        moved('bad', { createdAt: '2023-01-01T00:00:00+00:00' }), // offset form isn't accepted
        moved('c'),
      ]);

      expect(added.map(note => note.id)).toEqual(['c']);
    });

    it("doesn't write when nothing is new", async () => {
      expect(await service.addNotes([moved('note1')])).toEqual([]);
      expect(mockStorageService.setTaskNotes).not.toHaveBeenCalled();
    });
  });

  describe('createNote', () => {
    it('should create note with isArchived set to false by default', async () => {
      const noteData = {
        taskId: 'task1',
        templateId: 'template1',
        templateName: 'Test Template',
        fieldValues: { field1: 'Test value' },
        timeEntryId: null,
        isArchived: false,
        archivedAt: null,
      };

      mockStorageService.getTaskNotes.mockResolvedValue([]);

      const result = await service.createNote(noteData);

      expect(result.isArchived).toBe(false);
      expect(result.archivedAt).toBe(null);
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    it('should validate template exists before creating note', async () => {
      const noteData = {
        taskId: 'task1',
        templateId: 'nonexistent',
        templateName: 'Test Template',
        fieldValues: { field1: 'Test value' },
        timeEntryId: null,
        isArchived: false,
        archivedAt: null,
      };

      mockTemplateService.getTemplateById.mockResolvedValue(null);

      await expect(service.createNote(noteData)).rejects.toThrow('Template with ID nonexistent not found');
    });
  });

  describe('updateNote', () => {
    it('should update note while preserving archive status', async () => {
      const archivedNote = {
        ...mockNote,
        isArchived: true,
        archivedAt: '2023-01-02T00:00:00.000Z',
      };
      mockStorageService.getTaskNotes.mockResolvedValue([archivedNote]);

      const updates = {
        fieldValues: { field1: 'Updated value' },
      };

      const result = await service.updateNote('note1', updates);

      expect(result.fieldValues.field1).toBe('Updated value');
      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toBe('2023-01-02T00:00:00.000Z');
      expect(result.updatedAt).not.toBe(archivedNote.updatedAt);
    });

    it('should allow updating archive status directly', async () => {
      const updates = {
        isArchived: true,
        archivedAt: '2023-01-02T00:00:00.000Z',
      };

      const result = await service.updateNote('note1', updates);

      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toBe('2023-01-02T00:00:00.000Z');
    });
  });
});
