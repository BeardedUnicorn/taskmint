import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactNode } from 'react';
import { useSessionNotesMigration } from '../useSessionNotesMigration';
import { useTaskNotes } from '../useTaskNotes';
import { TaskNotesProvider } from '../../contexts/TaskNotesContext';
import { STORAGE_KEYS } from '../../constants';
import { Task } from '../../types/task';
import { TaskSession } from '../../types/timer';
import { sessionNoteId, sessionNotesToTaskNotes } from '../../utils/notes';

const tasks: Task[] = [{ id: 'task-1', name: 'Annotation', createdAt: '', updatedAt: '' }];

const session = (id: string, notes?: string): TaskSession => ({
  id,
  taskId: 'task-1',
  taskName: 'Annotation',
  timerInstances: [],
  totalDuration: 0,
  isActive: false,
  date: '2026-10-10',
  createdAt: '2026-10-10T09:00:00+00:00',
  updatedAt: '2026-10-10T09:00:00+00:00',
  notes,
});

const storedNotes = () => {
  const raw = window.localStorage.getItem(STORAGE_KEYS.TASK_NOTES);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.data;
};

const wrapper = ({ children }: { children: ReactNode }) => <TaskNotesProvider>{children}</TaskNotesProvider>;

function renderMigration(sessions: TaskSession[], clearSessionNotes = vi.fn().mockResolvedValue(1)) {
  const view = renderHook(
    ({ sessions: current }) => {
      useSessionNotesMigration({ sessions: current, tasks, isLoading: false, clearSessionNotes });
      return useTaskNotes();
    },
    { wrapper, initialProps: { sessions } }
  );
  return { ...view, clearSessionNotes };
}

describe('useSessionNotesMigration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("copies each session's text into the notes, then clears it from the session", async () => {
    const { result, clearSessionNotes } = renderMigration([
      session('s-1', 'Labelled 40 items'),
      session('s-2'),
    ]);

    await waitFor(() => expect(clearSessionNotes).toHaveBeenCalledWith(['s-1']));
    expect(result.current.notes.map(note => note.id)).toEqual([sessionNoteId('s-1')]);
    expect(storedNotes()).toHaveLength(1);
  });

  it('never duplicates a note when rerun after a crash between the copy and the clear', async () => {
    // The copy landed last time, the clear didn't
    const [alreadyCopied] = sessionNotesToTaskNotes([session('s-1', 'Labelled 40 items')], tasks);
    window.localStorage.setItem(STORAGE_KEYS.TASK_NOTES, JSON.stringify([alreadyCopied]));

    const { result, clearSessionNotes } = renderMigration([session('s-1', 'Labelled 40 items')]);

    await waitFor(() => expect(clearSessionNotes).toHaveBeenCalledWith(['s-1']));
    expect(result.current.notes).toHaveLength(1);
    expect(storedNotes()).toHaveLength(1);
  });

  it("tries a session once per launch, even if its text is still there on the next reload", async () => {
    const clearSessionNotes = vi.fn().mockRejectedValue(new Error('backend down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessions = [session('s-1', 'text')];
    const { rerender } = renderMigration(sessions, clearSessionNotes);

    await waitFor(() => expect(clearSessionNotes).toHaveBeenCalledTimes(1));
    rerender({ sessions: [...sessions] });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(clearSessionNotes).toHaveBeenCalledTimes(1);
    expect(storedNotes()).toHaveLength(1);
  });

  it('does nothing when no session has text', async () => {
    const { result, clearSessionNotes } = renderMigration([session('s-1'), session('s-2', '  ')]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(clearSessionNotes).not.toHaveBeenCalled();
    expect(storedNotes()).toEqual([]);
  });
});
