import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionNotesDialog } from '../SessionNotesDialog';
import { TaskNotesProvider } from '../../../../contexts/TaskNotesContext';
import { NoteTemplatesProvider } from '../../../../contexts/NoteTemplatesContext';
import { NotificationProvider } from '../../../../contexts/NotificationContext';
import { useTaskNotes } from '../../../../hooks/useTaskNotes';
import { STORAGE_KEYS } from '../../../../constants';
import { TaskNote } from '../../../../types/notes';
import { Task } from '../../../../types/task';
import { TaskSession, TimerState } from '../../../../types/timer';
import { noteText } from '../../../../utils/notes';
import { seedAppRecords } from '../../../../testing';
import { readAppRecord } from '../../../../services/appRecords';

const tasks: Task[] = [{ id: 'task-1', name: 'Annotation', createdAt: '', updatedAt: '' }];

const session: TaskSession = {
  id: 's-1',
  taskId: 'task-1',
  taskName: 'Annotation',
  timerInstances: [
    {
      id: 'i-1',
      sessionId: 's-1',
      startTime: new Date(2026, 9, 10, 9, 15).toISOString(),
      endTime: new Date(2026, 9, 10, 10, 0).toISOString(),
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

function renderDialog(timerInstanceId: string | null = null, onClose = () => {}, dialogTasks = tasks) {
  return render(
    <NotificationProvider>
    <TaskNotesProvider>
      <NoteTemplatesProvider>
        <SessionNotesDialog
          onClose={onClose}
          session={session}
          timerInstanceId={timerInstanceId}
          tasks={dialogTasks}
        />
        <SessionRowPreview />
      </NoteTemplatesProvider>
    </TaskNotesProvider>
    </NotificationProvider>
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
    seedAppRecords({
      [STORAGE_KEYS.TASK_NOTES]: [
        note('n-1', 'Session note'),
        note('n-2', 'Timer note', { noteLevel: 'timer', timerInstanceId: 'i-1' }),
        note('n-3', 'Another session', { sessionId: 's-2' }),
      ],
    });
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

    const [saved] = readAppRecord(STORAGE_KEYS.TASK_NOTES) as unknown[];
    expect(saved).toMatchObject({ sessionId: 's-1', noteLevel: 'session', timerInstanceId: null });
  });

  it("puts a timer's note on the timer's own task, and titles the dialog after every task", async () => {
    const review: Task = { id: 'task-2', name: 'Review', createdAt: '', updatedAt: '' };
    const mixed: TaskSession = {
      ...session,
      timerInstances: [
        session.timerInstances[0],
        {
          ...session.timerInstances[0],
          id: 'i-2',
          task: { taskId: 'task-2', taskName: 'Review', hourlyRate: null },
        },
      ],
    };
    render(
      <NotificationProvider>
        <TaskNotesProvider>
          <NoteTemplatesProvider>
            <SessionNotesDialog onClose={() => {}} session={mixed} timerInstanceId="i-2" tasks={[...tasks, review]} />
          </NoteTemplatesProvider>
        </TaskNotesProvider>
      </NotificationProvider>
    );

    expect(await screen.findByText(/^Annotation, Review ·/)).toBeInTheDocument();
    await addNote('On the review');

    await waitFor(() => {
      const [saved] = readAppRecord(STORAGE_KEYS.TASK_NOTES) as unknown[];
      expect(saved).toMatchObject({ taskId: 'task-2', timerInstanceId: 'i-2', noteLevel: 'timer' });
    });
  });

  it('opened from a timer, adds a note for that timer', async () => {
    renderDialog('i-1');
    expect(await screen.findByText(/New notes are for the timer started at 9:15 AM/)).toBeInTheDocument();
    await addNote('Paused for a call');

    await waitFor(() => {
      const [saved] = readAppRecord(STORAGE_KEYS.TASK_NOTES) as unknown[];
      expect(saved).toMatchObject({ sessionId: 's-1', noteLevel: 'timer', timerInstanceId: 'i-1' });
    });
  });

  it('edits a note, collapses the editor, and deletes the note from it', async () => {
    seedAppRecords({ [STORAGE_KEYS.TASK_NOTES]: [note('n-1', 'Session note')] });
    renderDialog();
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Note' }));
    expect(await within(dialog).findByLabelText('Note Content')).toHaveValue('Session note');

    // The editor's (the list below has its own)
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Collapse notes' })[0]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Expand notes' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Note' }));
    await waitFor(() => expect(readAppRecord(STORAGE_KEYS.TASK_NOTES)).toEqual([]));
    expect(within(dialog).queryByLabelText('Note Content')).not.toBeInTheDocument();
  });

  it("starts a new note on the task's default template", async () => {
    seedAppRecords({
      [STORAGE_KEYS.NOTE_TEMPLATES]: [
        {
          id: 'standup',
          name: 'Standup',
          fields: [{ id: 'blockers', label: 'Blockers', type: 'text', required: false, order: 0 }],
          isActive: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    renderDialog(null, () => {}, [{ ...tasks[0], defaultNoteTemplateId: 'standup' }]);

    fireEvent.click(await screen.findByRole('button', { name: /add note|create first note/i }));
    expect(await screen.findByLabelText('Blockers')).toBeInTheDocument();
  });

  it('opens a note whose template is gone as a free-form note', async () => {
    seedAppRecords({ [STORAGE_KEYS.TASK_NOTES]: [note('n-1', 'Old note', { templateId: 'deleted-template' })] });
    renderDialog();
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Note' }));
    expect(await within(dialog).findByLabelText('Note Content')).toBeInTheDocument();
  });

  it('closes, dropping the note being edited', async () => {
    const onClose = vi.fn();
    renderDialog(null, onClose);

    fireEvent.click(await screen.findByRole('button', { name: /add note|create first note/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
