/**
 * The pages, keyed by sidebar view. Each route reads what its page needs
 * from the shared contexts, so only the page on screen re-renders when that
 * data changes. Everything but Sessions (the start page) loads on first visit.
 */

import { ComponentType, lazy, useCallback, useMemo } from 'react';
import { SidebarView } from '../navigation/views';
import { SessionDashboard } from '../components/pages/SessionDashboard';
import { useNavigation } from '../contexts/NavigationContext';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../contexts/TaskManagementContext';
import { useActiveTimer } from '../contexts/ActiveTimerContext';
import { useTimeEntries } from '../hooks/useTimeEntries';
import { useTimerEntryEdit } from '../hooks/useTimerEntryEdit';
import { EditTimeEntryData } from '../types/form';
import { instanceTaskId, instanceTaskName } from '../utils/timerHelpers';

const TasksPage = lazy(() => import('../components/pages/TasksPage').then(module => ({ default: module.TasksPage })));
const NotesPage = lazy(() => import('../components/pages/NotesPage').then(module => ({ default: module.NotesPage })));
const HistoryPage = lazy(() => import('../components/pages/history/HistoryPage').then(module => ({ default: module.HistoryPage })));
const CalendarPage = lazy(() => import('../components/pages/CalendarPage'));
const PayoutsPage = lazy(() => import('../components/pages/payouts/PayoutsPage').then(module => ({ default: module.PayoutsPage })));
const SettingsPage = lazy(() => import('../components/pages/SettingsPage').then(module => ({ default: module.SettingsPage })));

/** App-level actions a page can trigger (the dialogs live in the app shell). */
export interface PageProps {
  onStartWork: () => void;
  onAddTime: () => void;
}

/** Shared by History and Tasks: save an entry's edit, delete an entry (its timer). */
function useEntryActions() {
  const { deleteTimerInstance } = useSessionManagementContext();
  const saveTimerEdit = useTimerEntryEdit();
  const onUpdateEntry = useCallback(async (data: EditTimeEntryData) => {
    await saveTimerEdit(data);
  }, [saveTimerEdit]);
  return { onUpdateEntry, onDeleteEntry: deleteTimerInstance };
}

function SessionsRoute({ onStartWork, onAddTime }: PageProps) {
  return <SessionDashboard onStartWork={onStartWork} onAddTime={onAddTime} />;
}

function TasksRoute() {
  const { navigate, params, clearParams } = useNavigation();
  const { tasks, addTask, updateTask, deleteTask, archiveTask, unarchiveTask, toggleFavorite } =
    useTaskManagementContext();
  const { activeSession, startTask } = useSessionManagementContext();
  const { activeTimer } = useActiveTimer();
  const timeEntries = useTimeEntries();
  const { onUpdateEntry, onDeleteEntry } = useEntryActions();

  return (
    <TasksPage
      tasks={tasks}
      timeEntries={timeEntries}
      onAddTask={addTask}
      onUpdateTask={updateTask}
      onDeleteTask={deleteTask}
      onArchiveTask={archiveTask}
      onUnarchiveTask={unarchiveTask}
      onToggleFavorite={toggleFavorite}
      onUpdateEntry={onUpdateEntry}
      onDeleteEntry={onDeleteEntry}
      onStartTask={task => {
        void startTask(task.id, task.name);
      }}
      runningTaskId={activeTimer && activeSession ? instanceTaskId(activeTimer, activeSession) : null}
      onViewHistory={task => navigate('history', { focusTaskId: task.id })}
      newTaskRequested={params.intent === 'new-task'}
      onNewTaskRequestHandled={clearParams}
    />
  );
}

function NotesRoute() {
  const { tasks } = useTaskManagementContext();
  const { sessions, activeSession } = useSessionManagementContext();
  const { activeTimer } = useActiveTimer();
  const runningTask = useMemo(
    () =>
      activeTimer && activeSession
        ? { taskId: instanceTaskId(activeTimer, activeSession), taskName: instanceTaskName(activeTimer, activeSession) }
        : null,
    [activeTimer, activeSession]
  );
  return <NotesPage tasks={tasks} sessions={sessions} runningTask={runningTask} />;
}

function HistoryRoute({ onAddTime }: PageProps) {
  const { params, clearParams } = useNavigation();
  const { tasks } = useTaskManagementContext();
  const timeEntries = useTimeEntries();
  const { onUpdateEntry, onDeleteEntry } = useEntryActions();
  // A task whose entries History should open on (Tasks → View all in History)
  const focusTask = useMemo(
    () => tasks.find(task => task.id === params.focusTaskId) ?? null,
    [params.focusTaskId, tasks]
  );

  return (
    <HistoryPage
      timeEntries={timeEntries}
      tasks={tasks}
      onUpdateEntry={onUpdateEntry}
      onDeleteEntry={onDeleteEntry}
      onAddTime={onAddTime}
      focusTask={focusTask}
      onFocusApplied={clearParams}
    />
  );
}

export const PAGES: Record<SidebarView, ComponentType<PageProps>> = {
  sessions: SessionsRoute,
  tasks: TasksRoute,
  notes: NotesRoute,
  history: HistoryRoute,
  calendar: CalendarPage,
  payouts: PayoutsPage,
  settings: SettingsPage,
};
