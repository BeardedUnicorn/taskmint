/**
 * The session list's search and filters, and the sessions they leave grouped
 * by day (newest day first). Opens on the last RECENT_SESSION_DAYS days;
 * older sessions are a click away (and in History).
 */

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { TaskSession } from '../../../types/timer';
import { sessionTaskNames } from '../../../utils/timerHelpers';
import { WORKLOG_IMPORT_SOURCE } from '../../../types/workLog';

export const RECENT_SESSION_DAYS = 30;

export type StatusFilter = 'all' | 'active' | 'completed';
export type SourceFilter = 'all' | 'tracked' | 'imported';

export function isImportedSession(session: TaskSession | null): boolean {
  return session?.source === WORKLOG_IMPORT_SOURCE;
}

/**
 * A session's note texts, newest first. Text a session still carries itself
 * (old notes that couldn't be moved to the notes store) shows as a fallback.
 */
export function notesFor(session: TaskSession, sessionNotes?: Map<string, string[]>): string[] {
  const texts = sessionNotes?.get(session.id);
  if (texts && texts.length > 0) return texts;
  return session.notes?.trim() ? [session.notes] : [];
}

/** Active, or worked on (dated, or a timer started) on or after `cutoff`. */
function isRecent(session: TaskSession, cutoff: string): boolean {
  if (session.isActive || session.date >= cutoff) return true;
  return session.timerInstances.some(instance => dayjs(instance.startTime).format('YYYY-MM-DD') >= cutoff);
}

export function useSessionFilters({
  sessions,
  sessionNotes,
  archivedTaskNames = [],
}: {
  sessions: TaskSession[];
  sessionNotes?: Map<string, string[]>;
  /** Hidden from the task chips (their sessions still show). */
  archivedTaskNames?: string[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [taskFilters, setTaskFilters] = useState<string[]>([]);
  const [showOlder, setShowOlder] = useState(false);

  // Task chips. Archived tasks' names are hidden to keep the row manageable,
  // but a chip stays while it's selected so the filter can be cleared.
  const taskNames = useMemo(() => {
    const archived = new Set(archivedTaskNames);
    return Array.from(new Set(sessions.flatMap(sessionTaskNames)))
      .filter(name => !archived.has(name) || taskFilters.includes(name))
      .sort();
  }, [sessions, archivedTaskNames, taskFilters]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sessions.filter(session => {
      const names = sessionTaskNames(session);
      return (
        (!query ||
          names.some(name => name.toLowerCase().includes(query)) ||
          notesFor(session, sessionNotes).some(text => text.toLowerCase().includes(query)) ||
          session.date.includes(query)) &&
        (statusFilter === 'all' || (statusFilter === 'active') === session.isActive) &&
        (taskFilters.length === 0 || names.some(name => taskFilters.includes(name))) &&
        (sourceFilter === 'all' || (sourceFilter === 'imported') === isImportedSession(session))
      );
    });
  }, [sessions, searchQuery, statusFilter, taskFilters, sourceFilter, sessionNotes]);

  const { visible, olderCount } = useMemo(() => {
    const cutoff = dayjs()
      .subtract(RECENT_SESSION_DAYS - 1, 'day')
      .format('YYYY-MM-DD');
    const recent = filtered.filter(session => isRecent(session, cutoff));
    return { visible: showOlder ? filtered : recent, olderCount: filtered.length - recent.length };
  }, [filtered, showOlder]);

  const byDate = useMemo(() => {
    const groups = new Map<string, TaskSession[]>();
    for (const session of visible) {
      groups.set(session.date, [...(groups.get(session.date) ?? []), session]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, daySessions]) => ({
        date,
        sessions: daySessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      }));
  }, [visible]);

  const toggleTask = (name: string) =>
    setTaskFilters(previous => (previous.includes(name) ? previous.filter(t => t !== name) : [...previous, name]));

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSourceFilter('all');
    setTaskFilters([]);
  };

  return {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sourceFilter,
    setSourceFilter,
    taskFilters,
    taskNames,
    toggleTask,
    clearTaskFilters: () => setTaskFilters([]),
    clearFilters,
    showOlder,
    setShowOlder,
    olderCount,
    byDate,
  };
}

export type SessionFilters = ReturnType<typeof useSessionFilters>;
