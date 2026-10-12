import { describe, it, expect } from 'vitest';
import { noteText, sessionNoteId, sessionNotesToTaskNotes } from '../notes';
import { TaskNoteSchema, TaskNote } from '../../types/notes';
import { Task } from '../../types/task';
import { TaskSession } from '../../types/timer';

const session = (overrides: Partial<TaskSession> = {}): TaskSession => ({
  id: 's-1',
  taskId: 'task-1',
  taskName: 'Annotation',
  timerInstances: [],
  totalDuration: 0,
  isActive: false,
  date: '2026-10-10',
  // The backend writes RFC 3339 with an offset
  createdAt: '2026-10-10T09:00:00.123456+00:00',
  updatedAt: '2026-10-10T17:30:00+00:00',
  ...overrides,
});

const tasks: Task[] = [
  { id: 'task-1', name: 'Annotation', createdAt: '', updatedAt: '' },
  { id: 'task-2', name: 'Review', createdAt: '', updatedAt: '' },
];

describe('sessionNotesToTaskNotes', () => {
  it("turns a session's text into a free-form session note the store accepts", () => {
    const [note] = sessionNotesToTaskNotes([session({ notes: '  Labelled 40 items  ' })], tasks);

    expect(note).toMatchObject({
      id: sessionNoteId('s-1'),
      taskId: 'task-1',
      templateId: 'free-form',
      fieldValues: { content: 'Labelled 40 items' },
      sessionId: 's-1',
      noteLevel: 'session',
      createdAt: '2026-10-10T09:00:00.123Z',
      updatedAt: '2026-10-10T17:30:00.000Z',
    });
    expect(TaskNoteSchema.safeParse(note).success).toBe(true);
  });

  it('skips sessions without text', () => {
    expect(sessionNotesToTaskNotes([session(), session({ notes: '   ' })], tasks)).toEqual([]);
  });

  it("finds the task by name when the session has no task id, and leaves out sessions whose task can't be found", () => {
    const notes = sessionNotesToTaskNotes(
      [
        session({ id: 's-2', taskId: '', taskName: 'Review', notes: 'by name' }),
        session({ id: 's-3', taskId: '', taskName: 'Gone', notes: 'no task' }),
      ],
      tasks
    );
    expect(notes.map(note => [note.sessionId, note.taskId])).toEqual([['s-2', 'task-2']]);
  });

  it('gives a session the same note id every time', () => {
    const first = sessionNotesToTaskNotes([session({ notes: 'a' })], tasks);
    const again = sessionNotesToTaskNotes([session({ notes: 'a' })], tasks);
    expect(again[0].id).toBe(first[0].id);
  });
});

describe('noteText', () => {
  const note = (fieldValues: TaskNote['fieldValues']): TaskNote => ({
    id: 'n',
    taskId: 't',
    templateId: 'tmpl',
    templateName: 'Tmpl',
    fieldValues,
    createdAt: '',
    updatedAt: '',
  });

  it("is a free-form note's content, or a template note's filled text and numbers", () => {
    expect(noteText(note({ content: 'hello' }))).toBe('hello');
    expect(noteText(note({ a: 'Batch 7', b: '', c: 12, d: true, e: null }))).toBe('Batch 7 · 12');
    expect(noteText(note({}))).toBe('');
  });
});
