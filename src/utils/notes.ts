/**
 * Note helpers shared by the Notes page, the session notes dialog and the
 * session rows.
 */

import { TaskNote } from '../types/notes';
import { Task } from '../types/task';
import { TaskSession } from '../types/timer';
import { findTaskFor } from './earnings';

export const FREE_FORM_TEMPLATE_ID = 'free-form';
export const FREE_FORM_TEMPLATE_NAME = 'Free-form Note';

/** Fixed id for a session's moved plain-text note, so moving twice can't duplicate it. */
export function sessionNoteId(sessionId: string): string {
  return `note_session_${sessionId}`;
}

/** The note's text: free-form content, or a template note's filled text and number fields. */
export function noteText(note: TaskNote): string {
  return Object.values(note.fieldValues ?? {})
    .filter(
      value =>
        (typeof value === 'string' && value.trim() !== '') ||
        (typeof value === 'number' && Number.isFinite(value))
    )
    .map(value => String(value).trim())
    .join(' · ');
}

/** Newest first by last edit. */
export function newestFirst(a: TaskNote, b: TaskNote): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function toIso(value: string | undefined, fallback: string): string {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

/**
 * Sessions used to keep a plain-text note of their own. Each one with text
 * becomes a free-form session note (fixed id, dated like the session).
 * Sessions whose task can't be identified are left out, so their text stays
 * where it is.
 */
export function sessionNotesToTaskNotes(
  sessions: TaskSession[],
  tasks: Task[],
  nowIso: string = new Date().toISOString()
): TaskNote[] {
  const notes: TaskNote[] = [];
  for (const session of sessions) {
    const content = session.notes?.trim();
    if (!content) continue;
    const taskId = session.taskId || findTaskFor(session, tasks)?.id;
    if (!taskId) continue;

    const createdAt = toIso(session.createdAt, nowIso);
    notes.push({
      id: sessionNoteId(session.id),
      taskId,
      templateId: FREE_FORM_TEMPLATE_ID,
      templateName: FREE_FORM_TEMPLATE_NAME,
      fieldValues: { content },
      sessionId: session.id,
      timerInstanceId: null,
      noteLevel: 'session',
      isArchived: false,
      archivedAt: null,
      createdAt,
      updatedAt: toIso(session.updatedAt, createdAt),
    });
  }
  return notes;
}
