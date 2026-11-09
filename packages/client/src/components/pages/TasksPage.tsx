import { useState, useEffect, useMemo } from 'react';
import { Box, Paper } from '@mui/material';
import { Assignment as TaskIcon } from '@mui/icons-material';
import { Task } from '../../types/task';
import { PageContainer, PageHeader } from '../layout/PageLayout';
import { EmptyState } from '../ui/display/EmptyState';
import { TimeEntry } from '../../types/timer';
import { TaskDetailPane } from './tasks/TaskDetailPane';
import { TaskListPane } from './tasks/TaskListPane';
import { TaskFormDialog } from './tasks/TaskFormDialog';
import { DeleteTaskDialog, TaskHistory } from './tasks/DeleteTaskDialog';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { EditTimeEntryData } from '../../types/form';
import { getEntryElapsedMs } from '../../utils/timerHelpers';
import { findTaskFor } from '../../utils/earnings';
import { useCompactLayout } from '../../hooks/useCompactLayout';
import { PHONE } from '../../theme/media';

interface TasksPageProps {
  tasks: Task[];
  timeEntries: TimeEntry[];
  onAddTask: (taskData: {
    name: string;
    hourlyRate?: number;
    defaultNoteTemplateId?: string | null;
  }) => Promise<Task | null>;
  onUpdateTask: (
    taskId: string,
    updates: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }
  ) => Promise<Task | null>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onArchiveTask: (taskId: string) => Promise<Task | null>;
  onUnarchiveTask: (taskId: string) => Promise<Task | null>;
  onToggleFavorite: (taskId: string) => Promise<Task | null>;
  onUpdateEntry: (data: EditTimeEntryData) => void;
  onDeleteEntry: (entryId: string) => void;
  /** Starts (or continues) work on a task. */
  onStartTask: (task: Task) => void;
  /** The task whose timer is running, if any. */
  runningTaskId: string | null;
  /** Opens History filtered to a task. */
  onViewHistory: (task: Task) => void;
  /** Open the new-task form (⌘N, the command palette). */
  newTaskRequested: boolean;
  /** Called once the form has opened for that request. */
  onNewTaskRequestHandled: () => void;
}

export function TasksPage({
  tasks,
  timeEntries,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onArchiveTask,
  onUnarchiveTask,
  onToggleFavorite,
  onUpdateEntry,
  onDeleteEntry,
  onStartTask,
  runningTaskId,
  onViewHistory,
  newTaskRequested,
  onNewTaskRequestHandled,
}: TasksPageProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(
    () => tasks.find(t => !t.isArchived) ?? tasks[0] ?? null
  );
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  // A phone shows one pane at a time: the list, or the task picked from it
  const compact = useCompactLayout();
  const [phoneDetailOpen, setPhoneDetailOpen] = useState(false);
  const phoneShowsDetail = phoneDetailOpen && selectedTask !== null;

  useEffect(() => {
    if (!newTaskRequested) return;
    setShowNewTaskDialog(true);
    onNewTaskRequestHandled();
  }, [newTaskRequested, onNewTaskRequestHandled]);

  // Keep the selection in sync with the task list
  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTask(null);
      return;
    }
    const current = selectedTask ? tasks.find(t => t.id === selectedTask.id) : undefined;
    if (!current) {
      // No selection, or the selected task no longer exists: prefer the first active task
      setSelectedTask(tasks.find(t => !t.isArchived) ?? tasks[0]);
    } else if (current !== selectedTask) {
      // Refresh the selected object after edits/archiving so the detail pane stays current
      setSelectedTask(current);
    }
  }, [tasks, selectedTask]);

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
    setPhoneDetailOpen(true);
  };

  const handleAddTaskDialog = async (taskData: {
    name: string;
    hourlyRate?: number;
    defaultNoteTemplateId?: string | null;
  }) => {
    const newTask = await onAddTask(taskData);
    if (newTask) {
      setShowNewTaskDialog(false);
      setSelectedTask(newTask); // Auto-select the newly created task
    }
    return newTask;
  };

  // A failure goes back to the dialog, which shows a taken name at the field
  const handleSaveEdit = async (
    taskId: string,
    updates: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }
  ) => {
    const updatedTask = await onUpdateTask(taskId, updates);
    if (updatedTask && selectedTask?.id === taskId) {
      setSelectedTask(updatedTask);
    }
    return updatedTask;
  };

  const deletingTask = deletingTaskId ? (tasks.find(t => t.id === deletingTaskId) ?? null) : null;

  // Time tracked against the task being deleted, matched the same way the
  // detail pane matches its entries (task id, or name for older entries).
  const deletingTaskHistory = useMemo((): TaskHistory => {
    if (!deletingTask) return { entryCount: 0, trackedMs: 0 };
    const entries = timeEntries.filter(
      entry => entry.taskId === deletingTask.id || entry.taskName === deletingTask.name
    );
    return {
      entryCount: entries.length,
      trackedMs: entries.reduce((total, entry) => total + getEntryElapsedMs(entry), 0),
    };
  }, [deletingTask, timeEntries]);

  const handleConfirmDelete = async (taskId: string) => {
    try {
      await onDeleteTask(taskId);
    } catch {
      // The task hook reported it; the task stays selected
      return;
    }
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
    }
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEntryEdit = (data: EditTimeEntryData) => {
    onUpdateEntry(data);
    setEditingEntry(null);
  };

  const handleAddTaskClick = () => {
    setShowNewTaskDialog(true);
  };

  return (
    <PageContainer fill>
      <PageHeader title="Tasks" subtitle="Your tasks, their rates, and the time tracked on each" />

      {/* Task List + Details */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Paper
          elevation={1}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: 340,
              flexShrink: 0,
              height: '100%',
              borderRight: '1px solid',
              borderColor: 'divider',
              [PHONE]: { width: '100%', borderRight: 0, display: phoneShowsDetail ? 'none' : 'block' },
            }}
          >
            <TaskListPane
              tasks={tasks}
              selectedTask={selectedTask}
              onSelectTask={handleSelectTask}
              onAddClick={handleAddTaskClick}
              onEditTask={setEditingTask}
              onDeleteTask={setDeletingTaskId}
              onArchiveTask={task => void onArchiveTask(task.id)}
              onUnarchiveTask={task => void onUnarchiveTask(task.id)}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, height: '100%', [PHONE]: { display: phoneShowsDetail ? 'block' : 'none' } }}>
            {selectedTask ? (
              <TaskDetailPane
                onBack={compact ? () => setPhoneDetailOpen(false) : undefined}
                task={selectedTask}
                timeEntries={timeEntries}
                onToggleFavorite={taskId => void onToggleFavorite(taskId)}
                onEditEntry={handleEditEntry}
                onDeleteEntry={onDeleteEntry}
                onStart={onStartTask}
                isRunning={runningTaskId === selectedTask.id}
                onViewHistory={onViewHistory}
              />
            ) : (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <EmptyState
                  plain
                  icon={<TaskIcon />}
                  title="Select a task"
                  description="Its rate, totals and time entries show here."
                />
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      {/* Task Form Dialogs */}
      <TaskFormDialog
        open={showNewTaskDialog}
        onClose={() => setShowNewTaskDialog(false)}
        mode="add"
        initialTask={null}
        onSubmit={handleAddTaskDialog}
      />

      {editingTask && (
        <TaskFormDialog
          open
          onClose={() => setEditingTask(null)}
          mode="edit"
          initialTask={editingTask}
          onSubmit={data => handleSaveEdit(editingTask.id, data)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteTaskDialog
        task={deletingTask}
        history={deletingTaskHistory}
        onDelete={taskId => {
          void handleConfirmDelete(taskId);
        }}
        onArchive={taskId => void onArchiveTask(taskId)}
        onClose={() => setDeletingTaskId(null)}
      />

      {/* Edit Time Entry Dialog */}
      {editingEntry && (
        <EditTimeEntryDialog
          entry={{
            id: editingEntry.id,
            taskId: findTaskFor(editingEntry, tasks)?.id ?? editingEntry.taskId ?? '',
            durationMs: getEntryElapsedMs(editingEntry),
            startTime: editingEntry.startTime.toISOString(),
          }}
          onSave={handleSaveEntryEdit}
          onClose={() => setEditingEntry(null)}
          tasks={tasks}
        />
      )}
    </PageContainer>
  );
}
