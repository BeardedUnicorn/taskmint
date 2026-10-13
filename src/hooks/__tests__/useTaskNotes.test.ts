import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
// The state hook itself (useTaskNotes reads it from TaskNotesProvider)
import { useTaskNotesState as useTaskNotes, useTaskNotes as useSharedTaskNotes } from '../useTaskNotes';
import { TaskNotesService } from '../../services/TaskNotesService';
import { TaskNote } from '../../types/notes';

vi.mock('../../services/TaskNotesService');

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
