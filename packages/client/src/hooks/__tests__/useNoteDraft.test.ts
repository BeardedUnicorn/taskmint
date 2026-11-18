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

  it("saves a note whose template has a pattern that isn't a regular expression", async () => {
    const broken: NoteTemplate = {
      ...template,
      fields: [{ ...template.fields[0], validation: { pattern: '[A-Z' } }, template.fields[1]],
    };
    const persist = vi.fn(async (values: Record<string, unknown>) => ({ ...saved, fieldValues: values }));
    const { result } = renderHook(() => useNoteDraft({ note: saved, template: broken, persist }));

    act(() => result.current.setField('summary', 'Still saveable'));
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    expect(persist).toHaveBeenCalledWith({ summary: 'Still saveable', score: 4 }, saved);
    expect(result.current.status.state).toBe('saved');
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

describe('useNoteDraft, leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets the saves that leaving started run. */
  const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

  it('saves what was typed in the last second when the editor goes away', async () => {
    const persist = vi.fn(async (values: Record<string, unknown>) => ({ ...saved, fieldValues: values }));
    const { result, unmount } = renderHook(() => useNoteDraft({ note: saved, template, persist }));

    act(() => result.current.setField('summary', 'Typed, then closed'));
    unmount();
    await settle();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ summary: 'Typed, then closed', score: 4 }, saved);
    // (the waiting auto-save went with the editor)
    await act(() => vi.advanceTimersByTimeAsync(5 * AUTOSAVE_DELAY_MS));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('creates a new note that was never saved, but not one with nothing in it', async () => {
    const persist = vi.fn(async (values: Record<string, unknown>) => ({ ...saved, fieldValues: values }));
    const typed = renderHook(() => useNoteDraft({ note: null, template: null, persist }));
    act(() => typed.result.current.setField('content', 'A thought'));
    typed.unmount();
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ content: 'A thought' }, null);

    const blank = renderHook(() => useNoteDraft({ note: null, template: null, persist }));
    act(() => blank.result.current.setField('content', '   '));
    blank.unmount();
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('leaves a saved note alone when it was emptied, wrong, or not changed', async () => {
    const persist = vi.fn(async () => saved);
    const onError = vi.fn();
    const emptied = renderHook(() => useNoteDraft({ note: saved, template, persist, onError }));
    act(() => emptied.result.current.replaceValues({ summary: '', score: null }));
    emptied.unmount();

    const wrong = renderHook(() => useNoteDraft({ note: saved, template, persist, onError }));
    act(() => wrong.result.current.setField('score', 9));
    wrong.unmount();

    const untouched = renderHook(() => useNoteDraft({ note: saved, template, persist, onError }));
    untouched.unmount();

    await settle();
    expect(persist).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('saves nothing when auto-save is off, or the changes were discarded', async () => {
    const persist = vi.fn(async () => saved);
    const manual = renderHook(() => useNoteDraft({ note: saved, template, persist, autoSave: false }));
    act(() => manual.result.current.setField('summary', 'Edited'));
    manual.unmount();

    const discarded = renderHook(() => useNoteDraft({ note: saved, template, persist }));
    act(() => discarded.result.current.setField('summary', 'Edited'));
    act(() => discarded.result.current.discard());
    discarded.unmount();

    await settle();
    expect(persist).not.toHaveBeenCalled();

    // An edit after that is a change to keep again
    const resumed = renderHook(() => useNoteDraft({ note: saved, template, persist }));
    act(() => resumed.result.current.discard());
    act(() => resumed.result.current.setField('summary', 'Kept after all'));
    resumed.unmount();
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("doesn't save again what a save that just finished already has", async () => {
    const persist = vi.fn(async (values: Record<string, unknown>) => ({ ...saved, fieldValues: values }));
    const { result, unmount } = renderHook(() => useNoteDraft({ note: saved, template, persist }));

    act(() => result.current.setField('summary', 'Saved, then closed'));
    // Save and close: the editor goes before it has drawn the save as done
    await act(async () => {
      await result.current.save();
      unmount();
    });
    await settle();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('waits for a save on its way, so a new note is created once and then updated', async () => {
    const created = { ...saved, id: 'new-note' };
    let land!: (note: TaskNote) => void;
    const persist = vi
      .fn<(values: Record<string, unknown>, note: TaskNote | null) => Promise<TaskNote>>()
      .mockImplementationOnce(() => new Promise(resolve => (land = resolve)))
      .mockImplementation(async () => created);
    const { result, unmount } = renderHook(() => useNoteDraft({ note: null, template: null, persist }));

    act(() => result.current.setField('content', 'First words'));
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(persist).toHaveBeenCalledTimes(1);
    // More typed while it's being created, then the editor closes
    act(() => result.current.setField('content', 'First words, and more'));
    unmount();
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);

    land(created);
    await settle();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith({ content: 'First words, and more' }, created);
  });

  it("doesn't try again a save that failed on its way out", async () => {
    let fail!: (error: Error) => void;
    const persist = vi.fn(() => new Promise<TaskNote>((_, reject) => (fail = reject)));
    const onError = vi.fn();
    const { result, unmount } = renderHook(() => useNoteDraft({ note: saved, template, persist, onError }));

    act(() => result.current.setField('summary', 'Edited'));
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    act(() => result.current.setField('summary', 'Edited more'));
    unmount();
    fail(new Error('disk full'));
    await settle();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('says why when the save on the way out fails', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('disk full'));
    const onError = vi.fn();
    const { result, unmount } = renderHook(() => useNoteDraft({ note: saved, template, persist, onError }));

    act(() => result.current.setField('summary', 'Edited'));
    unmount();
    await settle();

    expect(onError).toHaveBeenCalledWith('disk full');
  });
});
