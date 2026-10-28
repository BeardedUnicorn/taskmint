import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
// The state hook itself (useTaskNotes reads it from TaskNotesProvider)
import { useTaskNotesState as useTaskNotes, useTaskNotes as useSharedTaskNotes } from '../useTaskNotes';
import { TaskNotesService } from '../../services/TaskNotesService';
import { TaskNote } from '../../types/notes';
import { announceAppRecordsChange } from '../../testing';

vi.mock('../../services/TaskNotesService');

const notifications = vi.hoisted(() => ({ showInfo: vi.fn(), showError: vi.fn() }));
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => notifications,
}));

const mockNotesService = {
  getAllNotes: vi.fn(),
  createNote: vi.fn(),
  addNotes: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  archiveNote: vi.fn(),
  unarchiveNote: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (TaskNotesService.getInstance as any).mockReturnValue(mockNotesService);
});

const note = (id: string, fieldValues: Record<string, unknown>, templateName = 'Template'): TaskNote => ({
  id,
  taskId: 'task1',
  templateId: 'template1',
  templateName,
  fieldValues,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

describe('useTaskNotes', () => {
  it('loads every note, and is loading until then', async () => {
    mockNotesService.getAllNotes.mockResolvedValue([note('1', {}), note('2', {})]);
    const { result } = renderHook(() => useTaskNotes());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notes.map(n => n.id)).toEqual(['1', '2']);
  });

  it('keeps the load error as a message', async () => {
    mockNotesService.getAllNotes.mockRejectedValue('disk unreadable');
    const { result } = renderHook(() => useTaskNotes());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('disk unreadable');
  });

  it('searches the template name and text or number fields', async () => {
    mockNotesService.getAllNotes.mockResolvedValue([
      note('1', { content: 'Reviewed the PR' }),
      note('2', { count: 42 }),
      note('3', {}, 'Standup'),
    ]);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(3));

    expect(result.current.searchNotes('review').map(n => n.id)).toEqual(['1']);
    expect(result.current.searchNotes('42').map(n => n.id)).toEqual(['2']);
    expect(result.current.searchNotes('stand').map(n => n.id)).toEqual(['3']);
    expect(result.current.searchNotes('  ')).toHaveLength(3);
  });

  it('applies creates, updates and deletes to the shared list', async () => {
    mockNotesService.getAllNotes.mockResolvedValue([note('1', { content: 'a' })]);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    mockNotesService.createNote.mockResolvedValue(note('2', { content: 'b' }));
    await act(async () => {
      await result.current.createNote({ taskId: 'task1', templateId: 't', templateName: 'T', fieldValues: {} });
    });
    expect(result.current.notes.map(n => n.id)).toEqual(['1', '2']);

    mockNotesService.updateNote.mockResolvedValue(note('1', { content: 'edited' }));
    await act(async () => {
      await result.current.updateNote('1', { fieldValues: { content: 'edited' } });
    });
    expect(result.current.notes[0].fieldValues.content).toBe('edited');

    mockNotesService.deleteNote.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.deleteNote('2');
    });
    expect(result.current.notes.map(n => n.id)).toEqual(['1']);
  });

  it('puts a deleted note back with Undo', async () => {
    const saved = note('1', { content: 'keep me' }, 'Daily log');
    mockNotesService.getAllNotes.mockResolvedValue([saved]);
    mockNotesService.deleteNote.mockResolvedValue(undefined);
    mockNotesService.addNotes.mockImplementation(async (notes: TaskNote[]) => notes);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    await act(async () => {
      await result.current.deleteNote('1');
    });
    expect(result.current.notes).toHaveLength(0);
    expect(notifications.showInfo).toHaveBeenCalledWith('Deleted the "Daily log" note', {
      category: 'note',
      actions: [expect.objectContaining({ label: 'Undo' })],
    });

    const [, { actions }] = notifications.showInfo.mock.calls[0];
    await act(async () => {
      await actions[0].onClick();
    });
    await waitFor(() => expect(result.current.notes).toEqual([saved]));
    expect(mockNotesService.addNotes).toHaveBeenCalledWith([saved]);
  });

  it("says so when Undo can't put the note back", async () => {
    mockNotesService.getAllNotes.mockResolvedValue([note('1', { content: 'x' })]);
    mockNotesService.deleteNote.mockResolvedValue(undefined);
    mockNotesService.addNotes.mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    await act(async () => {
      await result.current.deleteNote('1');
    });
    const [, { actions }] = notifications.showInfo.mock.calls[0];
    await act(async () => {
      await actions[0].onClick();
    });
    await waitFor(() => expect(notifications.showError).toHaveBeenCalledWith('disk full', { category: 'note' }));
  });

  it('applies archives and unarchives to the shared list', async () => {
    mockNotesService.getAllNotes.mockResolvedValue([note('1', {}), note('2', {})]);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(2));

    mockNotesService.archiveNote.mockResolvedValue({ ...note('1', {}), isArchived: true });
    await act(async () => {
      await result.current.archiveNote('1');
    });
    expect(result.current.notes.map(n => n.isArchived)).toEqual([true, undefined]);

    mockNotesService.unarchiveNote.mockResolvedValue({ ...note('1', {}), isArchived: false });
    await act(async () => {
      await result.current.unarchiveNote('1');
    });
    expect(result.current.notes.map(n => n.isArchived)).toEqual([false, undefined]);
  });

  it("searches past fields that are neither text nor numbers", async () => {
    mockNotesService.getAllNotes.mockResolvedValue([note('1', { done: true, tags: ['x'] })]);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    expect(result.current.searchNotes('true')).toEqual([]);
  });

  it('offers no Undo for a note it never listed', async () => {
    mockNotesService.getAllNotes.mockResolvedValue([]);
    mockNotesService.deleteNote.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteNote('elsewhere');
    });
    expect(notifications.showInfo).not.toHaveBeenCalled();
  });

  it('leaves the list alone when Undo finds the note already back', async () => {
    mockNotesService.getAllNotes.mockResolvedValue([note('1', {})]);
    mockNotesService.deleteNote.mockResolvedValue(undefined);
    // Its id exists again (restored in another tab), so nothing is added
    mockNotesService.addNotes.mockResolvedValue([]);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    await act(async () => {
      await result.current.deleteNote('1');
    });
    const [, { actions }] = notifications.showInfo.mock.calls[0];
    await act(async () => {
      await actions[0].onClick();
    });
    expect(mockNotesService.addNotes).toHaveBeenCalled();
    expect(result.current.notes).toEqual([]);
  });

  it('logs a failed reload of notes saved elsewhere, keeping the list', async () => {
    mockNotesService.getAllNotes.mockResolvedValueOnce([note('1', {})]);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockNotesService.getAllNotes.mockRejectedValueOnce(new Error('unreadable'));

    act(() => announceAppRecordsChange({ keys: ['taskNotes'], conflict: false }));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to reload notes:', expect.any(Error)));
    expect(result.current.notes).toHaveLength(1);
    error.mockRestore();
  });

  it('rethrows a failed save with its message', async () => {
    mockNotesService.getAllNotes.mockResolvedValue([]);
    const { result } = renderHook(() => useTaskNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockNotesService.deleteNote.mockRejectedValue(new Error('Note with ID x not found'));
    await expect(result.current.deleteNote('x')).rejects.toThrow('Note with ID x not found');
  });
});

describe('useTaskNotes context', () => {
  it('needs the provider', () => {
    expect(() => renderHook(() => useSharedTaskNotes())).toThrow(/TaskNotesProvider/);
  });
});
