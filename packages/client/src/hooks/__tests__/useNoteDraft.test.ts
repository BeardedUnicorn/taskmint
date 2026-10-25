import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNoteDraft, AUTOSAVE_DELAY_MS, EMPTY_NOTE_MESSAGE } from '../useNoteDraft';
import { NoteTemplate, TaskNote } from '../../types/notes';

const template: NoteTemplate = {
  id: 'template1',
  name: 'Review',
  fields: [
    { id: 'summary', label: 'Summary', type: 'text', required: true, order: 0 },
    { id: 'score', label: 'Score', type: 'number', required: false, order: 1, validation: { max: 5 } },
  ],
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const saved: TaskNote = {
  id: 'note1',
  taskId: 'task1',
  templateId: 'template1',
  templateName: 'Review',
  fieldValues: { summary: 'Good', score: 4 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('useNoteDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts from the saved note, numbers as numbers', () => {
    const persist = vi.fn();
    const { result } = renderHook(() =>
      useNoteDraft({ note: { ...saved, fieldValues: { summary: 'Good', score: '4' } }, template, persist })
    );
    expect(result.current.values).toEqual({ summary: 'Good', score: 4 });
    expect(result.current.status).toEqual({ state: 'idle' });
  });

  it('saves a second after the last edit', async () => {
    const persist = vi.fn(async (values: Record<string, unknown>) => ({ ...saved, fieldValues: values }));
    const { result } = renderHook(() => useNoteDraft({ note: saved, template, persist }));

    act(() => result.current.setField('summary', 'Better'));
    expect(result.current.status).toEqual({ state: 'dirty' });
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
    });
    expect(persist).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(persist).toHaveBeenCalledWith({ summary: 'Better', score: 4 }, saved);
    expect(result.current.dirty).toBe(false);
    expect(result.current.status.state).toBe('saved');
  });

  it("doesn't create a note with nothing in it", async () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useNoteDraft({ note: null, template: null, persist }));

    act(() => result.current.touch());
    act(() => {
      vi.advanceTimersByTime(5 * AUTOSAVE_DELAY_MS);
    });
    let outcome = '';
    await act(async () => {
      outcome = await result.current.save();
    });

    expect(outcome).toBe('empty');
    expect(persist).not.toHaveBeenCalled();
  });

  it("won't empty a saved note; it says to delete it instead", async () => {
    const persist = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useNoteDraft({ note: saved, template, persist, onError }));

    act(() => result.current.replaceValues({ summary: '', score: null }));
    act(() => {
      vi.advanceTimersByTime(5 * AUTOSAVE_DELAY_MS);
    });
    expect(persist).not.toHaveBeenCalled();

    let outcome = '';
    await act(async () => {
      outcome = await result.current.save();
    });
    expect(outcome).toBe('invalid');
    expect(onError).toHaveBeenCalledWith(EMPTY_NOTE_MESSAGE);
  });

  it('shows field errors and waits for them to be fixed', async () => {
    const persist = vi.fn(async () => saved);
    const { result } = renderHook(() => useNoteDraft({ note: saved, template, persist }));

    act(() => result.current.setField('score', 9));
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(result.current.errors).toEqual({ score: 'Score must be at most 5' });
    expect(persist).not.toHaveBeenCalled();

    // Still wrong: no retry every second
    await act(async () => {
      vi.advanceTimersByTime(5 * AUTOSAVE_DELAY_MS);
    });
    expect(persist).not.toHaveBeenCalled();

    act(() => result.current.setField('score', 5));
    expect(result.current.errors).toEqual({});
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('stops auto-saving after a failure until the next edit', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('disk full'));
    const onError = vi.fn();
    const { result } = renderHook(() => useNoteDraft({ note: saved, template, persist, onError }));

    act(() => result.current.setField('summary', 'Edited'));
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(result.current.status).toEqual({ state: 'error', message: 'disk full' });
    expect(onError).toHaveBeenCalledWith('disk full');

    await act(async () => {
      vi.advanceTimersByTime(5 * AUTOSAVE_DELAY_MS);
    });
    expect(persist).toHaveBeenCalledTimes(1);

    act(() => result.current.setField('summary', 'Edited again'));
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("doesn't save automatically when told not to", async () => {
    const persist = vi.fn(async () => saved);
    const { result } = renderHook(() => useNoteDraft({ note: saved, template, persist, autoSave: false }));

    act(() => result.current.setField('summary', 'Edited'));
    await act(async () => {
      vi.advanceTimersByTime(5 * AUTOSAVE_DELAY_MS);
    });
    expect(persist).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ state: 'dirty' });
  });

  it('remembers the note a first save created', async () => {
    const created = { ...saved, id: 'new-note', fieldValues: { content: 'hello' } };
    const persist = vi.fn(async () => created);
    const { result } = renderHook(() => useNoteDraft({ note: null, template: null, persist }));

    act(() => result.current.setField('content', 'hello'));
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(persist).toHaveBeenCalledWith({ content: 'hello' }, null);
    expect(result.current.note).toBe(created);

    act(() => result.current.setField('content', 'hello again'));
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(persist).toHaveBeenLastCalledWith({ content: 'hello again' }, created);
  });
});
