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

interface TasksPageProps {
  tasks: Task[];
  timeEntries: TimeEntry[];
  onAddTask: (taskData: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => Promise<Task | null>;
  onUpdateTask?: (taskId: string, updates: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => Promise<Task | null>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onArchiveTask?: (taskId: string) => Promise<Task | null>;
  onUnarchiveTask?: (taskId: string) => Promise<Task | null>;
  onToggleFavorite?: (taskId: string) => Promise<Task | null>;
  onUpdateEntry?: (data: EditTimeEntryData) => void;
  onDeleteEntry?: (entryId: string) => void;
  /** Starts (or continues) work on a task. */
  onStartTask?: (task: Task) => void;
  /** The task whose timer is running, if any. */
  runningTaskId?: string | null;
  /** Opens History filtered to a task. */
  onViewHistory?: (task: Task) => void;
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
  runningTaskId = null,
  onViewHistory,
}: TasksPageProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(
    () => tasks.find(t => !t.isArchived) ?? tasks[0] ?? null
  );
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

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
  };

  const handleAddTaskDialog = async (taskData: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => {
    const newTask = await onAddTask(taskData);
    if (newTask) {
      setShowNewTaskDialog(false);
      setSelectedTask(newTask); // Auto-select the newly created task
    }
    return newTask;
  };



  const handleSaveEdit = async (taskId: string, updates: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => {
    if (!onUpdateTask) return null;

    try {
      const updatedTask = await onUpdateTask(taskId, updates);
      if (updatedTask && selectedTask?.id === taskId) {
        setSelectedTask(updatedTask);
      }
      return updatedTask;
    } catch (error) {
      console.error('Failed to update task:', error);
      return null;
    }
  };

  const deletingTask = deletingTaskId ? tasks.find(t => t.id === deletingTaskId) ?? null : null;

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
    if (!onDeleteTask) return;

    try {
      await onDeleteTask(taskId);
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEntryEdit = (data: EditTimeEntryData) => {
    if (!editingEntry || !onUpdateEntry) return;

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
            }}
          >
            <TaskListPane
              tasks={tasks}
              selectedTask={selectedTask}
              onSelectTask={handleSelectTask}
              onAddClick={handleAddTaskClick}
              onEditTask={onUpdateTask ? setEditingTask : undefined}
              onDeleteTask={onDeleteTask ? setDeletingTaskId : undefined}
              onArchiveTask={onArchiveTask ? (task) => { void onArchiveTask(task.id); } : undefined}
              onUnarchiveTask={onUnarchiveTask ? (task) => { void onUnarchiveTask(task.id); } : undefined}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, height: '100%' }}>
            {selectedTask ? (
              <TaskDetailPane
                task={selectedTask}
                timeEntries={timeEntries}
                onToggleFavorite={onToggleFavorite ? (taskId) => { void onToggleFavorite(taskId); } : undefined}
                onEditEntry={onUpdateEntry ? handleEditEntry : () => {}}
                onDeleteEntry={onDeleteEntry ?? (() => {})}
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

      <TaskFormDialog
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        mode="edit"
        initialTask={editingTask}
        onSubmit={(data) => (editingTask ? handleSaveEdit(editingTask.id, data) : Promise.resolve(null))}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteTaskDialog
        task={deletingTask}
        history={deletingTaskHistory}
        onDelete={(taskId) => { void handleConfirmDelete(taskId); }}
        onArchive={onArchiveTask ? (taskId) => { void onArchiveTask(taskId); } : undefined}
        onClose={() => setDeletingTaskId(null)}
      />

      {/* Edit Time Entry Dialog */}
      {editingEntry && (
        <EditTimeEntryDialog
          open={true}
          entry={{
            id: editingEntry.id,
            taskId: findTaskFor(editingEntry, tasks)?.id ?? editingEntry.taskId ?? '',
            durationMs: getEntryElapsedMs(editingEntry),
            startTime: editingEntry.startTime
              ? new Date(editingEntry.startTime).toISOString()
              : undefined,
          }}
          onSave={handleSaveEntryEdit}
          onClose={() => setEditingEntry(null)}
          tasks={tasks}
        />
      )}
    </PageContainer>
  );
}
