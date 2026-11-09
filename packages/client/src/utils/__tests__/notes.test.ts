import { describe, it, expect } from 'vitest';
import { newestFirst, noteText } from '../notes';
import { TaskNote } from '../../types/notes';

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
    expect(noteText(note({ a: Number.NaN, b: Infinity }))).toBe('');
    expect(noteText({ ...note({}), fieldValues: undefined } as unknown as TaskNote)).toBe('');
  });
});

describe('newestFirst', () => {
  it('sorts by the last edit, newest first', () => {
    const at = (id: string, updatedAt: string) => ({ id, updatedAt }) as TaskNote;
    const sorted = [
      at('old', '2026-10-01T00:00:00Z'),
      at('new', '2026-10-03T00:00:00Z'),
      at('mid', '2026-10-02T00:00:00Z'),
    ].sort(newestFirst);
    expect(sorted.map(n => n.id)).toEqual(['new', 'mid', 'old']);
  });
});
