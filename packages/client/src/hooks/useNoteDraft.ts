/**
 * A note being edited: its field values, whether they're saved, and saving,
 * by hand or on its own a second after you stop typing.
 *
 * Never saved: an empty draft (a new note with nothing in it isn't created;
 * a saved note emptied by Clear isn't overwritten with nothing, deleting is
 * the way to do that). Auto-save also waits while a field shows an error, or
 * after a failed save until the next edit, so a failure doesn't repeat every
 * second.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NoteTemplate, TaskNote } from '../types/notes';
import {
  FieldValues,
  coerceNumbers,
  emptyValues,
  isEmptyDraft,
  validateFieldValues,
} from '../utils/noteFields';
import { errorMessage } from '../utils/errors';

export const AUTOSAVE_DELAY_MS = 1000;

export const EMPTY_NOTE_MESSAGE = 'This note is empty — delete it instead';

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'dirty' }
  | { state: 'saving' }
  | { state: 'saved'; at: Date }
  | { state: 'error'; message: string };

/**
 * `saved`; `empty` (a new note with nothing in it: nothing to save);
 * `invalid` (a field error, or a saved note emptied); `failed` (the store
 * refused).
 */
export type SaveResult = 'saved' | 'empty' | 'invalid' | 'failed';

export interface UseNoteDraftOptions {
  /** The note as saved; null for a new one. Read once: remount (key) for another. */
  note: TaskNote | null;
  /** The template the values follow; null for a free-form note. */
  template: NoteTemplate | null;
  /** Writes the values (creating the note when `note` is null); resolves to the saved note. */
  persist: (values: FieldValues, note: TaskNote | null) => Promise<TaskNote>;
  autoSave?: boolean;
  /** Told why a save didn't happen (the editor shows it as a toast). */
  onError?: (message: string) => void;
}

export interface NoteDraft {
  values: FieldValues;
  errors: Record<string, string>;
  /** The note as last saved (set once a new note is first saved). */
  note: TaskNote | null;
  dirty: boolean;
  status: SaveStatus;
  setField: (fieldId: string, value: unknown) => void;
  /** All values at once (Clear, its Undo, another template). */
  replaceValues: (values: FieldValues) => void;
  /** Something outside the fields changed (the note's task). */
  touch: () => void;
  save: () => Promise<SaveResult>;
}

export function useNoteDraft({
  note: initialNote,
  template,
  persist,
  autoSave = true,
  onError,
}: UseNoteDraftOptions): NoteDraft {
  const [values, setValues] = useState<FieldValues>(() =>
    initialNote ? coerceNumbers(template?.fields, initialNote.fieldValues) : emptyValues(template?.fields)
  );
  const [note, setNote] = useState<TaskNote | null>(initialNote);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Each edit bumps the revision: a save only marks the draft clean if
  // nothing changed while it was in flight
  const revisionRef = useRef(0);
  const latestRef = useRef({ values, note, template, persist, onError });
  useEffect(() => {
    latestRef.current = { values, note, template, persist, onError };
  });

  const edited = useCallback(() => {
    revisionRef.current += 1;
    setDirty(true);
    setFailure(null);
  }, []);

  const setField = useCallback(
    (fieldId: string, value: unknown) => {
      setValues(previous => ({ ...previous, [fieldId]: value }));
      setErrors(previous => {
        if (!(fieldId in previous)) return previous;
        const { [fieldId]: _cleared, ...rest } = previous;
        return rest;
      });
      edited();
    },
    [edited]
  );

  const replaceValues = useCallback(
    (next: FieldValues) => {
      setValues(next);
      setErrors({});
      edited();
    },
    [edited]
  );

  const save = useCallback(async (): Promise<SaveResult> => {
    const { values, note, template, persist, onError } = latestRef.current;
    const processed = coerceNumbers(template?.fields, values);

    if (isEmptyDraft(processed)) {
      if (!note) return 'empty';
      onError?.(EMPTY_NOTE_MESSAGE);
      return 'invalid';
    }
    if (template) {
      const found = validateFieldValues(template.fields, processed);
      setErrors(found);
      if (Object.keys(found).length > 0) return 'invalid';
    }

    const revision = revisionRef.current;
    setSaving(true);
    try {
      const saved = await persist(processed, note);
      setNote(saved);
      setSavedAt(new Date());
      setFailure(null);
      if (revisionRef.current === revision) {
        setValues(processed);
        setDirty(false);
      }
      return 'saved';
    } catch (error) {
      const message = errorMessage(error, 'Failed to save note');
      setFailure(message);
      onError?.(message);
      return 'failed';
    } finally {
      setSaving(false);
    }
  }, []);

  const blocked = isEmptyDraft(values) || Object.keys(errors).length > 0 || failure !== null;
  useEffect(() => {
    if (!autoSave || !dirty || saving || blocked) return;
    const timeout = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [autoSave, dirty, saving, blocked, values, save]);

  const status: SaveStatus = saving
    ? { state: 'saving' }
    : failure
      ? { state: 'error', message: failure }
      : dirty
        ? { state: 'dirty' }
        : savedAt
          ? { state: 'saved', at: savedAt }
          : { state: 'idle' };

  return { values, errors, note, dirty, status, setField, replaceValues, touch: edited, save };
}
