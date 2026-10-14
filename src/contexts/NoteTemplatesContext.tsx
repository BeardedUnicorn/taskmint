import { ReactNode } from 'react';
import { NoteTemplatesContext, useNoteTemplatesState } from '../hooks/useNoteTemplates';

/**
 * Holds the one copy of the note templates (loaded once, so the built-in
 * free-form template is set up once) that every page reads via
 * useNoteTemplates.
 */
export function NoteTemplatesProvider({ children }: { children: ReactNode }) {
  const templates = useNoteTemplatesState();
  return <NoteTemplatesContext.Provider value={templates}>{children}</NoteTemplatesContext.Provider>;
}
