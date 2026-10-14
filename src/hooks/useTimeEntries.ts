import { useMemo } from 'react';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { sessionsToTimeEntries } from '../utils/timerHelpers';
import { TimeEntry } from '../types/timer';

/** Every timer as a time entry (one per instance; the entry id is the instance id). */
export function useTimeEntries(): TimeEntry[] {
  const { sessions } = useSessionManagementContext();
  return useMemo(() => sessionsToTimeEntries(sessions), [sessions]);
}
