/**
 * Tests for useTaskNotes hook
 */

import { renderHook, act } from '@testing-library/react';
import { useTaskNotes } from '../useTaskNotes';
import { TaskNote } from '../../types';

// Mock TaskNotesService
const mockTaskNotesService = {
  getAllNotes: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
  getNoteById: jest.fn(),
  getNotesByTaskId: jest.fn(),
  getNotesByTimeEntryId: jest.fn(),
  deleteNotesByTaskId: jest.fn(),
  getNotesByTemplateId: jest.fn(),
  getNotesStats: jest.fn(),
  searchNotes: jest.fn(),
  sortNotes: jest.fn(),
  getRecentNotes: jest.fn(),
  validateNoteData: jest.fn(),
};

jest.mock('../../services/TaskNotesService', () => ({
  TaskNotesService: {
    getInstance: () => mockTaskNotesService,
  },
}));

// Mock useAsyncError
const mockExecuteAsync = jest.fn();
jest.mock('../useAsyncError', () => ({
  useAsyncError: () => ({
    executeAsync: mockExecuteAsync,
  }),
}));

describe('useTaskNotes', () => {
  const sampleNote: TaskNote = {
    id: 'note-1',
    taskId: 'task-1',
    timeEntryId: 'entry-1',
    templateId: 'template-1',
    title: 'Daily Standup Note',
    content: {
      'field-1': 'Worked on feature X',
      'field-2': 'Will work on feature Y',
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const sampleNotes: TaskNote[] = [
    sampleNote,
    {
      id: 'note-2',
      taskId: 'task-2',
      timeEntryId: 'entry-2',
      templateId: 'template-2',
      title: 'Meeting Notes',
      content: {
        'field-3': 'John, Jane, Bob',
        'field-4': 'Review code, Deploy to staging',
      },
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteAsync.mockImplementation((fn) => fn());
    mockTaskNotesService.getAllNotes.mockResolvedValue(sampleNotes);
    mockTaskNotesService.getNotesByTaskId.mockResolvedValue([sampleNote]);
  });

  describe('initialization', () => {
    it('should initialize with empty notes and loading state', () => {
      const { result } = renderHook(() => useTaskNotes());

      expect(result.current.notes).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBe(null);
    });

    it('should load all notes when no taskId provided', async () => {
      const { result } = renderHook(() => useTaskNotes());

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockTaskNotesService.getAllNotes).toHaveBeenCalled();
      expect(result.current.notes).toEqual(sampleNotes);
      expect(result.current.isLoading).toBe(false);
    });

    it('should load notes for specific task when taskId provided', async () => {
      const { result } = renderHook(() => useTaskNotes('task-1'));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockTaskNotesService.getNotesByTaskId).toHaveBeenCalledWith('task-1');
      expect(result.current.notes).toEqual([sampleNote]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle loading error', async () => {
      const error = new Error('Failed to load notes');
      mockTaskNotesService.getAllNotes.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskNotes());

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.error).toBe('Failed to load notes');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('createNote', () => {
    it('should create a new note successfully', async () => {
      const newNoteData = {
        taskId: 'task-1',
        timeEntryId: 'entry-3',
        templateId: 'template-1',
        title: 'New Note',
        content: { 'field-1': 'Test content' },
      };

      const createdNote = {
        ...newNoteData,
        id: 'note-3',
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z'
      };
      mockTaskNotesService.createNote.mockResolvedValue(createdNote);

      const { result } = renderHook(() => useTaskNotes('task-1'));

      let returnedNote: TaskNote;
      await act(async () => {
        returnedNote = await result.current.createNote(newNoteData);
      });

      expect(mockTaskNotesService.createNote).toHaveBeenCalledWith(newNoteData);
      expect(returnedNote!).toEqual(createdNote);
      expect(result.current.notes).toContain(createdNote);
    });

    it('should not add note to state if it does not match current taskId filter', async () => {
      const newNoteData = {
        taskId: 'task-2', // Different from hook's taskId filter
        timeEntryId: 'entry-3',
        templateId: 'template-1',
        title: 'New Note',
        content: { 'field-1': 'Test content' },
      };

      const createdNote = {
        ...newNoteData,
        id: 'note-3',
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z'
      };
      mockTaskNotesService.createNote.mockResolvedValue(createdNote);

      const { result } = renderHook(() => useTaskNotes('task-1'));

      await act(async () => {
        await result.current.createNote(newNoteData);
      });

      expect(result.current.notes).not.toContain(createdNote);
    });
  });

  describe('updateNote', () => {
    it('should update note successfully', async () => {
      const updates = { title: 'Updated Note Title' };
      const updatedNote = { ...sampleNote, ...updates, updatedAt: '2024-01-03T00:00:00.000Z' };
      mockTaskNotesService.updateNote.mockResolvedValue(updatedNote);

      const { result } = renderHook(() => useTaskNotes('task-1'));

      // Set initial notes
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      let returnedNote: TaskNote;
      await act(async () => {
        returnedNote = await result.current.updateNote('note-1', updates);
      });

      expect(mockTaskNotesService.updateNote).toHaveBeenCalledWith('note-1', updates);
      expect(returnedNote!).toEqual(updatedNote);

      const updatedNoteInState = result.current.notes.find(n => n.id === 'note-1');
      expect(updatedNoteInState).toEqual(updatedNote);
    });
  });

  describe('deleteNote', () => {
    it('should delete note successfully', async () => {
      mockTaskNotesService.deleteNote.mockResolvedValue(undefined);

      const { result } = renderHook(() => useTaskNotes('task-1'));

      // Set initial notes
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      await act(async () => {
        await result.current.deleteNote('note-1');
      });

      expect(mockTaskNotesService.deleteNote).toHaveBeenCalledWith('note-1');
      expect(result.current.notes.find(n => n.id === 'note-1')).toBeUndefined();
    });
  });

  describe('getNotesByTaskId', () => {
    it('should get notes by task id', async () => {
      const taskNotes = [sampleNote];
      mockTaskNotesService.getNotesByTaskId.mockResolvedValue(taskNotes);

      const { result } = renderHook(() => useTaskNotes());

      let notes: TaskNote[];
      await act(async () => {
        notes = await result.current.getNotesByTaskId('task-1');
      });

      expect(mockTaskNotesService.getNotesByTaskId).toHaveBeenCalledWith('task-1');
      expect(notes!).toEqual(taskNotes);
    });
  });

  describe('getNotesByTimeEntryId', () => {
    it('should get notes by time entry id', async () => {
      const entryNotes = [sampleNote];
      mockTaskNotesService.getNotesByTimeEntryId.mockResolvedValue(entryNotes);

      const { result } = renderHook(() => useTaskNotes());

      let notes: TaskNote[];
      await act(async () => {
        notes = await result.current.getNotesByTimeEntryId('entry-1');
      });

      expect(mockTaskNotesService.getNotesByTimeEntryId).toHaveBeenCalledWith('entry-1');
      expect(notes!).toEqual(entryNotes);
    });
  });

  describe('getNoteById', () => {
    it('should get note by id', async () => {
      mockTaskNotesService.getNoteById.mockResolvedValue(sampleNote);

      const { result } = renderHook(() => useTaskNotes());

      let note: TaskNote | null;
      await act(async () => {
        note = await result.current.getNoteById('note-1');
      });

      expect(mockTaskNotesService.getNoteById).toHaveBeenCalledWith('note-1');
      expect(note!).toEqual(sampleNote);
    });

    it('should return null for non-existent note', async () => {
      mockTaskNotesService.getNoteById.mockResolvedValue(null);

      const { result } = renderHook(() => useTaskNotes());

      let note: TaskNote | null;
      await act(async () => {
        note = await result.current.getNoteById('non-existent');
      });

      expect(note).toBeNull();
    });
  });

  describe('deleteNotesByTaskId', () => {
    it('should delete all notes for a task', async () => {
      mockTaskNotesService.deleteNotesByTaskId.mockResolvedValue(undefined);

      const { result } = renderHook(() => useTaskNotes());

      await act(async () => {
        await result.current.deleteNotesByTaskId('task-1');
      });

      expect(mockTaskNotesService.deleteNotesByTaskId).toHaveBeenCalledWith('task-1');
    });
  });

  describe('getNotesByTemplateId', () => {
    it('should get notes by template id', () => {
      const templateNotes = [sampleNote];
      mockTaskNotesService.getNotesByTemplateId.mockReturnValue(templateNotes);

      const { result } = renderHook(() => useTaskNotes());

      const notes = result.current.getNotesByTemplateId('template-1');

      expect(mockTaskNotesService.getNotesByTemplateId).toHaveBeenCalledWith('template-1');
      expect(notes).toEqual(templateNotes);
    });
  });

  describe('getNotesStats', () => {
    it('should return notes statistics', () => {
      const stats = {
        totalNotes: 2,
        templatesUsed: ['template-1', 'template-2'],
        lastNoteDate: '2024-01-02T00:00:00.000Z',
        notesByTemplate: { 'template-1': 1, 'template-2': 1 },
      };
      mockTaskNotesService.getNotesStats.mockReturnValue(stats);

      const { result } = renderHook(() => useTaskNotes());

      const notesStats = result.current.getNotesStats();

      expect(mockTaskNotesService.getNotesStats).toHaveBeenCalled();
      expect(notesStats).toEqual(stats);
    });
  });

  describe('searchNotes', () => {
    it('should search notes by query', () => {
      const searchResults = [sampleNote];
      mockTaskNotesService.searchNotes.mockReturnValue(searchResults);

      const { result } = renderHook(() => useTaskNotes());

      const results = result.current.searchNotes('standup');

      expect(mockTaskNotesService.searchNotes).toHaveBeenCalledWith('standup');
      expect(results).toEqual(searchResults);
    });
  });

  describe('sortNotes', () => {
    it('should sort notes by specified criteria', () => {
      const sortedNotes = [...sampleNotes].reverse();
      mockTaskNotesService.sortNotes.mockReturnValue(sortedNotes);

      const { result } = renderHook(() => useTaskNotes());

      const sorted = result.current.sortNotes('createdAt', 'desc');

      expect(mockTaskNotesService.sortNotes).toHaveBeenCalledWith('createdAt', 'desc');
      expect(sorted).toEqual(sortedNotes);
    });
  });

  describe('getRecentNotes', () => {
    it('should get recent notes with default limit', () => {
      const recentNotes = [sampleNote];
      mockTaskNotesService.getRecentNotes.mockReturnValue(recentNotes);

      const { result } = renderHook(() => useTaskNotes());

      const recent = result.current.getRecentNotes();

      expect(mockTaskNotesService.getRecentNotes).toHaveBeenCalledWith(10);
      expect(recent).toEqual(recentNotes);
    });

    it('should get recent notes with custom limit', () => {
      const recentNotes = [sampleNote];
      mockTaskNotesService.getRecentNotes.mockReturnValue(recentNotes);

      const { result } = renderHook(() => useTaskNotes());

      const recent = result.current.getRecentNotes(5);

      expect(mockTaskNotesService.getRecentNotes).toHaveBeenCalledWith(5);
      expect(recent).toEqual(recentNotes);
    });
  });

  describe('validateNoteData', () => {
    it('should validate note data successfully', () => {
      const validationResult = { isValid: true, errors: {} };
      mockTaskNotesService.validateNoteData.mockReturnValue(validationResult);

      const { result } = renderHook(() => useTaskNotes());

      const noteData = { title: 'Test', content: {} };
      const validation = result.current.validateNoteData(noteData);

      expect(mockTaskNotesService.validateNoteData).toHaveBeenCalledWith(noteData);
      expect(validation).toEqual(validationResult);
    });

    it('should handle validation errors', () => {
      const { result } = renderHook(() => useTaskNotes());

      // Mock service to throw error
      mockTaskNotesService.validateNoteData.mockImplementation(() => {
        throw new Error('Validation error');
      });

      const validation = result.current.validateNoteData({});

      expect(validation).toEqual({
        isValid: false,
        errors: { general: 'Validation failed' },
      });
    });
  });

  describe('refreshNotes', () => {
    it('should reload notes from service', async () => {
      const { result } = renderHook(() => useTaskNotes());

      await act(async () => {
        await result.current.refreshNotes();
      });

      expect(mockTaskNotesService.getAllNotes).toHaveBeenCalledTimes(2); // Once on mount, once on refresh
    });
  });

  describe('taskId changes', () => {
    it('should reload notes when taskId changes', async () => {
      const { result, rerender } = renderHook(
        ({ taskId }) => useTaskNotes(taskId),
        { initialProps: { taskId: 'task-1' } }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockTaskNotesService.getNotesByTaskId).toHaveBeenCalledWith('task-1');

      // Change taskId
      rerender({ taskId: 'task-2' });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockTaskNotesService.getNotesByTaskId).toHaveBeenCalledWith('task-2');
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      const error = new Error('Service error');
      mockTaskNotesService.createNote.mockRejectedValue(error);
      mockExecuteAsync.mockImplementation(async (fn) => {
        try {
          return await fn();
        } catch (err) {
          throw err;
        }
      });

      const { result } = renderHook(() => useTaskNotes());

      await act(async () => {
        await expect(result.current.createNote({
          taskId: 'task-1',
          timeEntryId: 'entry-1',
          templateId: 'template-1',
          title: 'Test',
          content: {},
        })).rejects.toThrow('Service error');
      });
    });
  });

  describe('return values', () => {
    it('should return all expected properties and methods', () => {
      const { result } = renderHook(() => useTaskNotes());

      // State properties
      expect(result.current).toHaveProperty('notes');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');

      // CRUD methods
      expect(result.current).toHaveProperty('createNote');
      expect(result.current).toHaveProperty('updateNote');
      expect(result.current).toHaveProperty('deleteNote');
      expect(result.current).toHaveProperty('getNoteById');
      expect(result.current).toHaveProperty('getNotesByTaskId');
      expect(result.current).toHaveProperty('getNotesByTimeEntryId');

      // Utility methods
      expect(result.current).toHaveProperty('deleteNotesByTaskId');
      expect(result.current).toHaveProperty('getNotesByTemplateId');
      expect(result.current).toHaveProperty('getNotesStats');
      expect(result.current).toHaveProperty('searchNotes');
      expect(result.current).toHaveProperty('sortNotes');
      expect(result.current).toHaveProperty('getRecentNotes');
      expect(result.current).toHaveProperty('validateNoteData');
      expect(result.current).toHaveProperty('refreshNotes');

      // Verify all methods are functions
      expect(typeof result.current.createNote).toBe('function');
      expect(typeof result.current.updateNote).toBe('function');
      expect(typeof result.current.deleteNote).toBe('function');
      expect(typeof result.current.getNoteById).toBe('function');
      expect(typeof result.current.getNotesByTaskId).toBe('function');
      expect(typeof result.current.getNotesByTimeEntryId).toBe('function');
      expect(typeof result.current.deleteNotesByTaskId).toBe('function');
      expect(typeof result.current.getNotesByTemplateId).toBe('function');
      expect(typeof result.current.getNotesStats).toBe('function');
      expect(typeof result.current.searchNotes).toBe('function');
      expect(typeof result.current.sortNotes).toBe('function');
      expect(typeof result.current.getRecentNotes).toBe('function');
      expect(typeof result.current.validateNoteData).toBe('function');
      expect(typeof result.current.refreshNotes).toBe('function');
    });
  });
});
