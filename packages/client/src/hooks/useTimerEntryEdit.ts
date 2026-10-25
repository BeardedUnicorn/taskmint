/**
 * Saving an Edit Time Entry dialog, shared by History, Tasks and the Sessions
 * panel: the new duration, and a move to another task when one was picked.
 * A moved timer's own notes follow it to its new session and task.
 */

import { useCallback } from 'react';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../contexts/TaskManagementContext';
import { useTaskNotes } from './useTaskNotes';
import { EditTimeEntryData } from '../types/form';
import { buildTimerEditUpdates } from '../utils/timerHelpers';

/** Resolves to whether the edit was saved (failures are already shown). */
export function useTimerEntryEdit(): (data: EditTimeEntryData) => Promise<boolean> {
  const { sessions, editTimerEntry } = useSessionManagementContext();
  const { tasks } = useTaskManagementContext();
  const { notes, updateNote } = useTaskNotes();

  return useCallback(async (data: EditTimeEntryData) => {
    // Entry ids are raw timer-instance ids (the "session_" prefix is only
    // used by the derived activeEntry).
    const instanceId = data.id.replace(/^session_/, '');
    const session = sessions.find(s => s.timerInstances.some(i => i.id === instanceId));
    const instance = session?.timerInstances.find(i => i.id === instanceId);
    if (!session || !instance) return false;

    const target =
      data.taskId !== session.taskId ? tasks.find(task => task.id === data.taskId) : undefined;
    const sessionId = await editTimerEntry(instanceId, {
      updates: buildTimerEditUpdates(instance, data.durationMs),
      moveTo: target ? { taskId: target.id, taskName: target.name } : undefined,
    });
    if (!sessionId) return false;

    if (target) {
      const timerNotes = notes.filter(note => note.timerInstanceId === instanceId);
      for (const note of timerNotes) {
        await updateNote(note.id, { sessionId, taskId: target.id });
      }
    }
    return true;
  }, [sessions, tasks, notes, editTimerEntry, updateNote]);
}
