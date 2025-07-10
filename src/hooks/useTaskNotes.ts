/**
 * Task Notes Hook
 * 
 * This hook provides state management and operations for task notes
 * including CRUD operations, validation, and note management.
 */

import { useState, useEffect, useCallback } from 'react';
import { TaskNote, UseTaskNotesReturn } from '../types/notes';
import { TaskNotesService } from '../services/TaskNotesService';
import { useAsyncError } from './useAsyncError';

export function useTaskNotes(taskId?: string): UseTaskNotesReturn {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { executeAsync } = useAsyncError();
  const notesService = TaskNotesService.getInstance();

  /**
   * Load all notes or notes for a specific task
   */
  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const loadedNotes = taskId 
        ? await notesService.getNotesByTaskId(taskId)
        : await notesService.getAllNotes();
      setNotes(loadedNotes);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load notes';
      setError(errorMessage);
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [notesService, taskId]);

  /**
   * Create a new note
   */
  const createNote = useCallback(async (
    noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TaskNote> => {
    return executeAsync(async () => {
      setError(null);
      
      const newNote = await notesService.createNote(noteData);
      
      // Update local state if this note belongs to our current task filter
      if (!taskId || newNote.taskId === taskId) {
        setNotes(prev => [...prev, newNote]);
      }
      
      return newNote;
    });
  }, [notesService, executeAsync, taskId]);

  /**
   * Update an existing note
   */
  const updateNote = useCallback(async (
    noteId: string, 
    updates: Partial<TaskNote>
  ): Promise<TaskNote> => {
    return executeAsync(async () => {
      setError(null);
      
      const updatedNote = await notesService.updateNote(noteId, updates);
      
      // Update local state
      setNotes(prev => 
        prev.map(note => 
          note.id === noteId ? updatedNote : note
        )
      );
      
      return updatedNote;
    });
  }, [notesService, executeAsync]);

  /**
   * Delete a note
   */
  const deleteNote = useCallback(async (noteId: string): Promise<void> => {
    return executeAsync(async () => {
      setError(null);
      
      await notesService.deleteNote(noteId);
      
      // Update local state
      setNotes(prev => prev.filter(note => note.id !== noteId));
    });
  }, [notesService, executeAsync]);

  /**
   * Archive a note
   */
  const archiveNote = useCallback(async (noteId: string): Promise<TaskNote> => {
    return executeAsync(async () => {
      setError(null);
      
      const archivedNote = await notesService.archiveNote(noteId);
      
      // Update local state
      setNotes(prev => 
        prev.map(note => 
          note.id === noteId ? archivedNote : note
        )
      );
      
      return archivedNote;
    });
  }, [notesService, executeAsync]);

  /**
   * Unarchive a note
   */
  const unarchiveNote = useCallback(async (noteId: string): Promise<TaskNote> => {
    return executeAsync(async () => {
      setError(null);
      
      const unarchivedNote = await notesService.unarchiveNote(noteId);
      
      // Update local state
      setNotes(prev => 
        prev.map(note => 
          note.id === noteId ? unarchivedNote : note
        )
      );
      
      return unarchivedNote;
    });
  }, [notesService, executeAsync]);

  /**
   * Get notes by task ID
   */
  const getNotesByTaskId = useCallback((targetTaskId: string): TaskNote[] => {
    return notes.filter(note => note.taskId === targetTaskId);
  }, [notes]);

  /**
   * Get notes by time entry ID
   */
  const getNotesByTimeEntryId = useCallback((timeEntryId: string): TaskNote[] => {
    return notes.filter(note => note.timeEntryId === timeEntryId);
  }, [notes]);

  /**
   * Get note by ID
   */
  const getNoteById = useCallback((noteId: string): TaskNote | undefined => {
    return notes.find(note => note.id === noteId);
  }, [notes]);

  /**
   * Delete all notes for a specific task
   */
  const deleteNotesByTaskId = useCallback(async (targetTaskId: string): Promise<void> => {
    return executeAsync(async () => {
      setError(null);
      
      await notesService.deleteNotesByTaskId(targetTaskId);
      
      // Update local state
      setNotes(prev => prev.filter(note => note.taskId !== targetTaskId));
    });
  }, [notesService, executeAsync]);

  /**
   * Get notes by template ID
   */
  const getNotesByTemplateId = useCallback((templateId: string): TaskNote[] => {
    return notes.filter(note => note.templateId === templateId);
  }, [notes]);

  /**
   * Get notes statistics for current task or all tasks
   */
  const getNotesStats = useCallback(() => {
    const relevantNotes = taskId ? getNotesByTaskId(taskId) : notes;
    const templatesUsed = [...new Set(relevantNotes.map(note => note.templateName))];
    const lastNote = relevantNotes
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

    return {
      totalNotes: relevantNotes.length,
      templatesUsed,
      lastNoteDate: lastNote?.updatedAt,
      notesByTemplate: templatesUsed.reduce((acc, templateName) => {
        acc[templateName] = relevantNotes.filter(note => note.templateName === templateName).length;
        return acc;
      }, {} as Record<string, number>),
    };
  }, [notes, taskId, getNotesByTaskId]);

  /**
   * Search notes by content
   */
  const searchNotes = useCallback((query: string): TaskNote[] => {
    if (!query.trim()) return notes;
    
    const lowercaseQuery = query.toLowerCase();
    return notes.filter(note => {
      // Search in template name
      if (note.templateName.toLowerCase().includes(lowercaseQuery)) {
        return true;
      }
      
      // Search in field values
      return Object.values(note.fieldValues).some(value => {
        if (typeof value === 'string') {
          return value.toLowerCase().includes(lowercaseQuery);
        }
        if (typeof value === 'number') {
          return value.toString().includes(query);
        }
        return false;
      });
    });
  }, [notes]);

  /**
   * Sort notes by various criteria
   */
  const sortNotes = useCallback((
    sortBy: 'createdAt' | 'updatedAt' | 'templateName',
    order: 'asc' | 'desc' = 'desc'
  ): TaskNote[] => {
    const sorted = [...notes].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'templateName':
          comparison = a.templateName.localeCompare(b.templateName);
          break;
      }
      
      return order === 'desc' ? -comparison : comparison;
    });
    
    return sorted;
  }, [notes]);

  /**
   * Get recent notes (last 7 days)
   */
  const getRecentNotes = useCallback((days: number = 7): TaskNote[] => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return notes.filter(note => 
      new Date(note.updatedAt) >= cutoffDate
    ).sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [notes]);

  /**
   * Get active (non-archived) notes
   */
  const getActiveNotes = useCallback((): TaskNote[] => {
    return notes.filter(note => !note.isArchived);
  }, [notes]);

  /**
   * Get archived notes
   */
  const getArchivedNotes = useCallback((): TaskNote[] => {
    return notes.filter(note => note.isArchived);
  }, [notes]);

  /**
   * Get active notes by task ID
   */
  const getActiveNotesByTaskId = useCallback((targetTaskId: string): TaskNote[] => {
    return notes.filter(note => note.taskId === targetTaskId && !note.isArchived);
  }, [notes]);

  /**
   * Get archived notes by task ID
   */
  const getArchivedNotesByTaskId = useCallback((targetTaskId: string): TaskNote[] => {
    return notes.filter(note => note.taskId === targetTaskId && note.isArchived);
  }, [notes]);

  /**
   * Validate note field values
   */
  const validateNoteData = useCallback(async (
    noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
    try {
      // This would typically call the service validation method
      // For now, we'll do basic validation
      const errors: Record<string, string> = {};
      
      if (!noteData.taskId) {
        errors.taskId = 'Task ID is required';
      }
      
      if (!noteData.templateId) {
        errors.templateId = 'Template ID is required';
      }
      
      if (!noteData.fieldValues || Object.keys(noteData.fieldValues).length === 0) {
        errors.fieldValues = 'At least one field value is required';
      }
      
      return {
        isValid: Object.keys(errors).length === 0,
        errors,
      };
    } catch (err) {
      return {
        isValid: false,
        errors: { general: 'Validation failed' },
      };
    }
  }, []);

  // Load notes on mount or when taskId changes
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  return {
    notes,
    createNote,
    updateNote,
    deleteNote,
    archiveNote,
    unarchiveNote,
    getNotesByTaskId,
    getNotesByTimeEntryId,
    getNoteById,
    isLoading,
    error,
    // Additional utility methods
    deleteNotesByTaskId,
    getNotesByTemplateId,
    getNotesStats,
    searchNotes,
    sortNotes,
    getRecentNotes,
    getActiveNotes,
    getArchivedNotes,
    getActiveNotesByTaskId,
    getArchivedNotesByTaskId,
    validateNoteData,
    refreshNotes: loadNotes,
  } as UseTaskNotesReturn & {
    archiveNote: (noteId: string) => Promise<TaskNote>;
    unarchiveNote: (noteId: string) => Promise<TaskNote>;
    deleteNotesByTaskId: (taskId: string) => Promise<void>;
    getNotesByTemplateId: (templateId: string) => TaskNote[];
    getNotesStats: () => {
      totalNotes: number;
      templatesUsed: string[];
      lastNoteDate?: string;
      notesByTemplate: Record<string, number>;
    };
    searchNotes: (query: string) => TaskNote[];
    sortNotes: (sortBy: 'createdAt' | 'updatedAt' | 'templateName', order?: 'asc' | 'desc') => TaskNote[];
    getRecentNotes: (days?: number) => TaskNote[];
    getActiveNotes: () => TaskNote[];
    getArchivedNotes: () => TaskNote[];
    getActiveNotesByTaskId: (taskId: string) => TaskNote[];
    getArchivedNotesByTaskId: (taskId: string) => TaskNote[];
    validateNoteData: (noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ isValid: boolean; errors: Record<string, string> }>;
    refreshNotes: () => Promise<void>;
  };
}
