import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionNotesDialog } from '../SessionNotesDialog';
import { TaskNotesProvider } from '../../../../contexts/TaskNotesContext';
import { useTaskNotes } from '../../../../hooks/useTaskNotes';
import { STORAGE_KEYS } from '../../../../constants';
import { TaskNote } from '../../../../types/notes';
import { Task } from '../../../../types/task';
import { TaskSession, TimerState } from '../../../../types/timer';
import { noteText } from '../../../../utils/notes';

const tasks: Task[] = [{ id: 'task-1', name: 'Annotation', createdAt: '', updatedAt: '' }];

const session: TaskSession = {
  id: 's-1',
  taskId: 'task-1',
  taskName: 'Annotation',
  timerInstances: [
    {
      id: 'i-1',
      sessionId: 's-1',
      startTime: new Date(2026, 9, 10, 9, 15),
      endTime: new Date(2026, 9, 10, 10, 0),
      duration: 45 * 60_000,
      state: TimerState.stopped,
      createdAt: '2026-10-10T09:15:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    },
  ],
  totalDuration: 45 * 60_000,
  isActive: false,
  date: '2026-10-10',
  createdAt: '2026-10-10T09:15:00Z',
  updatedAt: '2026-10-10T10:00:00Z',
};

const note = (id: string, content: string, overrides: Partial<TaskNote> = {}): TaskNote => ({
  id,
  taskId: 'task-1',
  templateId: 'free-form',
  templateName: 'Free-form Note',
  fieldValues: { content },
  sessionId: 's-1',
  noteLevel: 'session',
  isArchived: false,
  archivedAt: null,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
  ...overrides,
});

/** Another reader of the shared notes, like the session row preview. */
function SessionRowPreview() {
  const { notes } = useTaskNotes();
  return (
    <ul aria-label="row preview">
      {notes.filter(n => n.sessionId === 's-1').map(n => (
        <li key={n.id}>{noteText(n)}</li>
      ))}
    </ul>
  );
}

function renderDialog(timerInstanceId?: string) {
  return render(
    <TaskNotesProvider>
      <SessionNotesDialog
        open
        onClose={() => {}}
        session={session}
        timerInstanceId={timerInstanceId}
        tasks={tasks}
      />
      <SessionRowPreview />
    </TaskNotesProvider>
  );
}

async function addNote(text: string) {
  fireEvent.click(await screen.findByRole('button', { name: /add note|create first note/i }));
  fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));
}

describe('SessionNotesDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lists this session's notes (its own and its timers'), not other sessions'", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.TASK_NOTES,
      JSON.stringify([
        note('n-1', 'Session note'),
        note('n-2', 'Timer note', { noteLevel: 'timer', timerInstanceId: 'i-1' }),
        note('n-3', 'Another session', { sessionId: 's-2' }),
      ])
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');

    // (Each note's text shows in its preview and its expandable body)
    expect((await within(dialog).findAllByText('Session note')).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Timer note').length).toBeGreaterThan(0);
    expect(within(dialog).queryAllByText('Another session')).toHaveLength(0);
  });

  it('adds a session note that every other reader sees at once', async () => {
    renderDialog();
    await addNote('Labelled batch 7');

    // Outside the dialog, so aria-hidden while it's open
    const row = screen.getByRole('list', { name: 'row preview', hidden: true });
    await waitFor(() => expect(within(row).getByText('Labelled batch 7')).toBeInTheDocument());

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.TASK_NOTES)!);
    const [saved] = Array.isArray(stored) ? stored : stored.data;
    expect(saved).toMatchObject({ sessionId: 's-1', noteLevel: 'session', timerInstanceId: null });
  });

  it('opened from a timer, adds a note for that timer', async () => {
    renderDialog('i-1');
    expect(await screen.findByText(/New notes are for the timer started at 9:15 AM/)).toBeInTheDocument();
    await addNote('Paused for a call');

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.TASK_NOTES)!);
      const [saved] = Array.isArray(stored) ? stored : stored.data;
      expect(saved).toMatchObject({ sessionId: 's-1', noteLevel: 'timer', timerInstanceId: 'i-1' });
    });
  });
});
