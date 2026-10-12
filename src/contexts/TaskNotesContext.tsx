import { ReactNode } from 'react';
import { TaskNotesContext, useTaskNotesState } from '../hooks/useTaskNotes';

/**
 * Holds the one copy of the notes that the Notes page, the session notes
 * dialog and the session rows all read (via useTaskNotes).
 */
export function TaskNotesProvider({ children }: { children: ReactNode }) {
  const taskNotes = useTaskNotesState();
  return <TaskNotesContext.Provider value={taskNotes}>{children}</TaskNotesContext.Provider>;
}
