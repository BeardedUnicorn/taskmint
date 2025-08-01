import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useTaskNotes } from '../useTaskNotes';
import { TaskNotesService } from '../../services/TaskNotesService';
import { TaskNote } from '../../types/notes';

vi.mock('../../services/TaskNotesService');

const mockNotesService = {
  getAllNotes: vi.fn(),
  getNotesByTaskId: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  archiveNote: vi.fn(),
  unarchiveNote: vi.fn(),
  deleteNotesByTaskId: vi.fn(),
  getNotesByTemplateId: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (TaskNotesService.getInstance as any).mockReturnValue(mockNotesService);
});

describe('useTaskNotes retrieval helpers', () => {
  const notes: TaskNote[] = [
    {
      id: '1',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Template',
      fieldValues: {},
      timeEntryId: 'entry1',
      sessionId: 'session1',
      timerInstanceId: 'timer1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Template',
      fieldValues: {},
      timeEntryId: 'entry2',
      sessionId: 'session1',
      timerInstanceId: 'timer2',
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
    {
      id: '3',
      taskId: 'task2',
      templateId: 'template1',
      templateName: 'Template',
      fieldValues: {},
      timeEntryId: 'entry3',
      sessionId: 'session2',
      timerInstanceId: 'timer2',
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
    },
  ];

  it('returns notes filtered by session ID', async () => {
    mockNotesService.getAllNotes.mockResolvedValue(notes);
    const { result } = renderHook(() => useTaskNotes());

    await waitFor(() => !result.current.isLoading);

    const sessionNotes = result.current.getNotesBySessionId('session1');
    expect(sessionNotes).toHaveLength(2);
    expect(sessionNotes.every(n => n.sessionId === 'session1')).toBe(true);
  });

  it('returns notes filtered by timer instance ID', async () => {
    mockNotesService.getAllNotes.mockResolvedValue(notes);
    const { result } = renderHook(() => useTaskNotes());

    await waitFor(() => !result.current.isLoading);

    const timerNotes = result.current.getNotesByTimerInstanceId('timer2');
    expect(timerNotes).toHaveLength(2);
    expect(timerNotes.every(n => n.timerInstanceId === 'timer2')).toBe(true);
  });
});

describe('useTaskNotes stats', () => {
  const notesForStats: TaskNote[] = [
    {
      id: '1',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Template',
      fieldValues: {},
      timeEntryId: 'entry1',
      sessionId: 'session1',
      timerInstanceId: 'timer1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
    {
      id: '2',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Template',
      fieldValues: {},
      timeEntryId: 'entry2',
      sessionId: 'session1',
      timerInstanceId: 'timer2',
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
    },
    {
      id: '3',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Template',
      fieldValues: {},
      timeEntryId: 'entry3',
      sessionId: 'session1',
      timerInstanceId: 'timer3',
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  it('does not mutate notes state when computing stats', async () => {
    mockNotesService.getAllNotes.mockResolvedValue(notesForStats);
    const { result } = renderHook(() => useTaskNotes());

    await waitFor(() => !result.current.isLoading);

    const initialOrder = result.current.notes.map(n => n.id);

    const stats = result.current.getNotesStats();

    expect(result.current.notes.map(n => n.id)).toEqual(initialOrder);
    expect(stats.lastNoteDate).toBe('2024-01-03T00:00:00Z');
  });
});
