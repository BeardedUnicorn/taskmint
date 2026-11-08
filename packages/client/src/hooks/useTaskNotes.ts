/**
 * Task Notes Hook
 *
 * This hook provides state management and operations for task notes
 * including CRUD operations, validation, and note management.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TaskNote, UseTaskNotesReturn } from '../types/notes';
import { TaskNotesService } from '../services/TaskNotesService';
import { useAsyncError } from './useAsyncError';
import { errorMessage } from '../utils/errors';
import { useNotification } from '../contexts/NotificationContext';
import { useAppRecordsChanged } from './useAppRecordsChanged';
import { STORAGE_KEYS } from '../constants';

export const TaskNotesContext = createContext<UseTaskNotesReturn | null>(null);

/**
 * The notes every page shares (Notes page, session notes, session rows), so
 * a note saved in one place shows everywhere without a reload.
 */
export function useTaskNotes(): UseTaskNotesReturn {
  const context = useContext(TaskNotesContext);
  if (!context) {
    throw new Error('useTaskNotes must be used within a TaskNotesProvider');
  }
  return context;
}

/** The notes state itself. Use once, in TaskNotesProvider. */
export function useTaskNotesState(): UseTaskNotesReturn {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  // Loading until the first load finishes, so nothing mistakes "not loaded
  // yet" for "no notes".
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { executeAsync } = useAsyncError();
  const { showInfo, showError } = useNotification();
  const notesService = TaskNotesService.getInstance();
  // The note as it was, for a delete's Undo
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setNotes(await notesService.getAllNotes());
    } catch (err) {
      setError(errorMessage(err, 'Failed to load notes'));
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [notesService]);

  const createNote = useCallback(
    async (noteData: Omit<TaskNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskNote> => {
      return executeAsync(async () => {
        setError(null);
        const newNote = await notesService.createNote(noteData);
        setNotes(prev => [...prev, newNote]);
        return newNote;
      });
    },
    [notesService, executeAsync]
  );

  /**
   * Add finished notes in one write (notes moved in from elsewhere); notes
   * whose id already exists are skipped. Returns the notes that were added.
   */
  const addNotes = useCallback(
    async (newNotes: TaskNote[]): Promise<TaskNote[]> => {
      return executeAsync(async () => {
        setError(null);
        const added = await notesService.addNotes(newNotes);
        if (added.length > 0) {
          setNotes(prev => [...prev, ...added]);
        }
        return added;
      });
    },
    [notesService, executeAsync]
  );

  const replaceNote = useCallback((updated: TaskNote) => {
    setNotes(prev => prev.map(note => (note.id === updated.id ? updated : note)));
  }, []);

  const updateNote = useCallback(
    async (noteId: string, updates: Partial<TaskNote>): Promise<TaskNote> => {
      return executeAsync(async () => {
        setError(null);
        const updatedNote = await notesService.updateNote(noteId, updates);
        replaceNote(updatedNote);
        return updatedNote;
      });
    },
    [notesService, executeAsync, replaceNote]
  );

  // Undo of a delete: the saved note goes back as it was
  const restoreNote = useCallback(
    async (note: TaskNote) => {
      try {
        const added = await notesService.addNotes([note]);
        if (added.length > 0) setNotes(prev => [...prev, ...added]);
      } catch (err) {
        showError(errorMessage(err, "Couldn't restore the note"), { category: 'note' });
      }
    },
    [notesService, showError]
  );

  const deleteNote = useCallback(
    async (noteId: string): Promise<void> => {
      const snapshot = notesRef.current.find(note => note.id === noteId);
      return executeAsync(async () => {
        setError(null);
        await notesService.deleteNote(noteId);
        setNotes(prev => prev.filter(note => note.id !== noteId));
        if (snapshot) {
          showInfo(`Deleted the "${snapshot.templateName}" note`, {
            category: 'note',
            actions: [{ label: 'Undo', onClick: () => void restoreNote(snapshot) }],
          });
        }
      });
    },
    [notesService, executeAsync, showInfo, restoreNote]
  );

  const archiveNote = useCallback(
    async (noteId: string): Promise<TaskNote> => {
      return executeAsync(async () => {
        setError(null);
        const archivedNote = await notesService.archiveNote(noteId);
        replaceNote(archivedNote);
        return archivedNote;
      });
    },
    [notesService, executeAsync, replaceNote]
  );

  const unarchiveNote = useCallback(
    async (noteId: string): Promise<TaskNote> => {
      return executeAsync(async () => {
        setError(null);
        const unarchivedNote = await notesService.unarchiveNote(noteId);
        replaceNote(unarchivedNote);
        return unarchivedNote;
      });
    },
    [notesService, executeAsync, replaceNote]
  );

  /** Notes whose template name or any text/number field contains the query. */
  const searchNotes = useCallback(
    (query: string): TaskNote[] => {
      if (!query.trim()) return notes;

      const lowercaseQuery = query.toLowerCase();
      return notes.filter(note => {
        if (note.templateName.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }
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
    },
    [notes]
  );

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // Notes saved in another tab or device
  useAppRecordsChanged([STORAGE_KEYS.TASK_NOTES], () => {
    notesService.getAllNotes().then(setNotes, err => console.error('Failed to reload notes:', err));
  });

  return useMemo(
    () => ({
      notes,
      createNote,
      addNotes,
      updateNote,
      deleteNote,
      archiveNote,
      unarchiveNote,
      searchNotes,
      isLoading,
      error,
    }),
    [notes, createNote, addNotes, updateNote, deleteNote, archiveNote, unarchiveNote, searchNotes, isLoading, error]
  );
}
