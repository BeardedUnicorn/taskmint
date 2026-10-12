/**
 * Moves sessions' old plain-text notes into the notes store, where every
 * other note lives. Runs whenever loaded sessions still carry text: on the
 * first launch after the change, and after restoring an older backup.
 *
 * Copy first, then clear: a session's text is cleared only once a note for it
 * is stored. Note ids are fixed per session, so a rerun after a crash skips
 * notes already copied instead of duplicating them.
 */

import { useEffect, useRef } from 'react';
import { Task } from '../types/task';
import { TaskSession } from '../types/timer';
import { sessionNotesToTaskNotes } from '../utils/notes';
import { useTaskNotes } from './useTaskNotes';

interface UseSessionNotesMigrationProps {
  sessions: TaskSession[];
  tasks: Task[];
  /** True until sessions and tasks have loaded. */
  isLoading: boolean;
  clearSessionNotes: (sessionIds: string[]) => Promise<number>;
}

export function useSessionNotesMigration({
  sessions,
  tasks,
  isLoading,
  clearSessionNotes,
}: UseSessionNotesMigrationProps) {
  const { notes, addNotes, isLoading: notesLoading } = useTaskNotes();
  const runningRef = useRef(false);
  // Each session is tried once per launch: a failure (or a note the store
  // rejects) waits for the next launch instead of retrying on every reload.
  const attemptedRef = useRef(new Set<string>());

  useEffect(() => {
    if (isLoading || notesLoading || runningRef.current) return;
    const moved = sessionNotesToTaskNotes(sessions, tasks).filter(
      note => !attemptedRef.current.has(note.id)
    );
    if (moved.length === 0) return;

    runningRef.current = true;
    moved.forEach(note => attemptedRef.current.add(note.id));
    void (async () => {
      try {
        const added = await addNotes(moved);
        const stored = new Set([...notes, ...added].map(note => note.id));
        const sessionIds = moved
          .filter(note => stored.has(note.id))
          .map(note => note.sessionId as string);
        await clearSessionNotes(sessionIds);
      } catch (error) {
        console.error('Failed to move session notes:', error);
      } finally {
        runningRef.current = false;
      }
    })();
  }, [sessions, tasks, isLoading, notes, notesLoading, addNotes, clearSessionNotes]);
}
