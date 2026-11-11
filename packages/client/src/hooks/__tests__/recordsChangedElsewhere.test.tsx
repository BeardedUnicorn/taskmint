/**
 * What reads the records follows a change made in another tab or device
 * (the records service announces it), and a save that lost to one says so.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskManagement } from '../useTaskManagement';
import { useTaskNotesState } from '../useTaskNotes';
import { useNoteTemplatesState } from '../useNoteTemplates';
import { useAppRecord } from '../useAppRecord';
import { RECORD_CONFLICT_NOTICE, useRecordConflictNotice } from '../useRecordConflictNotice';
import { useAppRecordsChanged } from '../useAppRecordsChanged';
import { announceAppRecordsChange, seedAppRecords } from '../../testing';
import { createMockTask, createMockTaskNote } from '../../__tests__/setup/session-test-utils';
import { TaskService } from '../../services/TaskService';

const notifications = vi.hoisted(() => ({
  showInfo: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
}));
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => notifications,
}));

const elsewhere = (key: string) => announceAppRecordsChange({ keys: [key as never], conflict: false });

describe('records changed elsewhere', () => {
  it('reload the tasks', async () => {
    seedAppRecords({ predefinedTasks: [createMockTask({ id: 'a', name: 'A' })] });
    const { result } = renderHook(() => useTaskManagement());
    await waitFor(() => expect(result.current.tasks.map(task => task.id)).toEqual(['a']));

    seedAppRecords({
      predefinedTasks: [createMockTask({ id: 'a', name: 'A' }), createMockTask({ id: 'b', name: 'B' })],
    });
    act(() => elsewhere('predefinedTasks'));

    await waitFor(() => expect(result.current.tasks.map(task => task.id)).toEqual(['a', 'b']));
  });

  it('reload the notes', async () => {
    seedAppRecords({ taskNotes: [] });
    const { result } = renderHook(() => useTaskNotesState());
    // Let the first load finish
    await act(async () => {});

    seedAppRecords({ taskNotes: [createMockTaskNote({ id: 'n1' })] });
    act(() => elsewhere('taskNotes'));

    await waitFor(() => expect(result.current.notes.map(note => note.id)).toEqual(['n1']));
  });

  it('reload the note templates', async () => {
    const { result } = renderHook(() => useNoteTemplatesState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const builtIn = result.current.templates.length;

    seedAppRecords({ noteTemplates: [] });
    act(() => elsewhere('noteTemplates'));

    // Read again: the built-in template is set up again in an empty list
    await waitFor(() => expect(result.current.templates).toHaveLength(builtIn));
  });

  it('reload a record kept in state, back to its initial value once removed', async () => {
    seedAppRecords({ dailyGoal: { targetAmount: 50 } });
    const { result } = renderHook(() => useAppRecord('dailyGoal', { targetAmount: 0 }));
    expect(result.current[0]).toEqual({ targetAmount: 50 });

    seedAppRecords({ dailyGoal: { targetAmount: 80 } });
    act(() => elsewhere('dailyGoal'));
    expect(result.current[0]).toEqual({ targetAmount: 80 });

    seedAppRecords({});
    act(() => elsewhere('dailyGoal'));
    expect(result.current[0]).toEqual({ targetAmount: 0 });
    // Another record's change leaves it alone
    seedAppRecords({ dailyGoal: { targetAmount: 99 } });
    act(() => elsewhere('taskNotes'));
    expect(result.current[0]).toEqual({ targetAmount: 0 });
  });

  it('log when the reload fails', async () => {
    seedAppRecords({ predefinedTasks: [] });
    const { result } = renderHook(() => useTaskManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(TaskService.prototype, 'getAllTasks').mockRejectedValueOnce(new Error('unreadable'));

    act(() => elsewhere('predefinedTasks'));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to reload tasks:', expect.any(Error)));
    error.mockRestore();
  });

  it('stop being followed once unmounted', () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useAppRecordsChanged(['taskNotes', 'dailyGoal'], onChange));
    act(() => elsewhere('dailyGoal'));
    expect(onChange).toHaveBeenCalledWith({ keys: ['dailyGoal'], conflict: false });

    unmount();
    act(() => elsewhere('dailyGoal'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('a save that lost to a change made elsewhere', () => {
  it('is announced', () => {
    renderHook(() => useRecordConflictNotice());

    act(() => elsewhere('taskNotes'));
    expect(notifications.showWarning).not.toHaveBeenCalled();

    act(() => announceAppRecordsChange({ keys: ['taskNotes'], conflict: true }));
    expect(notifications.showWarning).toHaveBeenCalledWith(RECORD_CONFLICT_NOTICE);
  });
});
