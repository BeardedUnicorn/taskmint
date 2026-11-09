/**
 * Note helpers shared by the Notes page, the session notes dialog and the
 * session rows.
 */

import { TaskNote } from '../types/notes';

export const FREE_FORM_TEMPLATE_ID = 'free-form';
export const FREE_FORM_TEMPLATE_NAME = 'Free-form Note';

/** The note's text: free-form content, or a template note's filled text and number fields. */
export function noteText(note: TaskNote): string {
  return Object.values(note.fieldValues ?? {})
    .filter(
      value =>
        (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value))
    )
    .map(value => String(value).trim())
    .join(' · ');
}

/** Newest first by last edit. */
export function newestFirst(a: TaskNote, b: TaskNote): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
