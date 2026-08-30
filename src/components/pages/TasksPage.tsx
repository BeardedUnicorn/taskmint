import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
} from '@mui/material';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';
import { TaskDetailPane } from './tasks/TaskDetailPane';
import { TaskListPane } from './tasks/TaskListPane';
import { TaskFormDialog } from './tasks/TaskFormDialog';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { ConfirmDialog, UpgradeDialog } from '../ui';
import { EditTimeEntryData } from '../../types/form';
import { useSubscription, useTaskLimit } from '../../contexts/SubscriptionContext';
import { getEntryElapsedMs } from '../../utils/timerHelpers';

interface TasksPageProps {
  tasks: Task[];
  timeEntries: TimeEntry[];
  onAddTask: (taskData: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => Promise<Task | null>;
  onUpdateTask?: (taskId: string, updates: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => Promise<Task | null>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onArchiveTask?: (taskId: string) => Promise<Task | null>;
  onUnarchiveTask?: (taskId: string) => Promise<Task | null>;
  onUpdateEntry?: (data: EditTimeEntryData) => void;
  onDeleteEntry?: (entryId: string) => void;
}

export function TasksPage({
  tasks,
  timeEntries,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onArchiveTask,
  onUnarchiveTask,
  onUpdateEntry,
  onDeleteEntry,
}: TasksPageProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(
    () => tasks.find(t => !t.isArchived) ?? tasks[0] ?? null
  );
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Subscription hooks
  const { subscription, upgradeSubscription } = useSubscription();
  const { canAddTask, currentCount, limit, reason, isLoading: limitLoading } = useTaskLimit(tasks);

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

  const handleConfirmDelete = async () => {
    if (!deletingTaskId || !onDeleteTask) return;

    try {
      await onDeleteTask(deletingTaskId);
      if (selectedTask?.id === deletingTaskId) {
        setSelectedTask(null);
      }
      setDeletingTaskId(null);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
  };

  const handleDeleteEntry = (entryId: string) => {
    setDeletingEntryId(entryId);
  };

  const handleSaveEntryEdit = (data: EditTimeEntryData) => {
    if (!editingEntry || !onUpdateEntry) return;

    onUpdateEntry(data);
    setEditingEntry(null);
  };

  const handleConfirmEntryDelete = () => {
    if (deletingEntryId && onDeleteEntry) {
      onDeleteEntry(deletingEntryId);
      setDeletingEntryId(null);
    }
  };

  const handleAddTaskClick = () => {
    if (limitLoading) return;
    if (!canAddTask) {
      setShowUpgradeDialog(true);
      return;
    }
    setShowNewTaskDialog(true);
  };

  const handleUpgrade = async (sku: any) => {
    try {
      await upgradeSubscription(sku);
      setShowUpgradeDialog(false);
    } catch (error) {
      console.error('Failed to upgrade subscription:', error);
    }
  };



  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Page Header */}
      <Box sx={{ p: 3, pb: 2 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Tasks
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your tasks and view detailed time tracking information
        </Typography>
      </Box>

      {/* Task Limit Display */}
      {limit && (
        <Box sx={{ px: 3, pb: 1 }}>
          <Alert 
            severity={canAddTask ? "info" : "warning"} 
            sx={{ mb: 1 }}
          >
            <Typography variant="body2">
              Tasks: {currentCount}/{limit} {!canAddTask && '(Limit reached)'}
            </Typography>
            {!canAddTask && reason && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {reason}
              </Typography>
            )}
          </Alert>
        </Box>
      )}

      {/* Main Content - Task List + Details */}
      <Box sx={{ flex: 1, overflow: 'hidden', px: 3, pb: 3 }}>
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
                allTasks={tasks}
                onEditEntry={onUpdateEntry ? handleEditEntry : () => {}}
                onDeleteEntry={onDeleteEntry ? handleDeleteEntry : () => {}}
              />
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 4,
                }}
              >
                <Alert severity="info" sx={{ maxWidth: 400 }}>
                  <Typography variant="h6" gutterBottom>
                    Select a Task
                  </Typography>
                  <Typography variant="body2">
                    Select a task to view details and time entries. For notes management, visit the Notes page.
                  </Typography>
                </Alert>
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
        availableTasks={tasks}
        onSubmit={handleAddTaskDialog}
      />

      <TaskFormDialog
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        mode="edit"
        initialTask={editingTask}
        availableTasks={tasks}
        onSubmit={(data) => (editingTask ? handleSaveEdit(editingTask.id, data) : Promise.resolve(null))}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deletingTaskId !== null}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone and will remove all associated time entries."
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingTaskId(null)}
        confirmLabel="Delete"
        severity="error"
      />

      {/* Edit Time Entry Dialog */}
      {editingEntry && (
        <EditTimeEntryDialog
          open={true}
          entry={{
            id: editingEntry.id,
            taskName: editingEntry.taskName,
            durationMs: getEntryElapsedMs(editingEntry),
            startTime: editingEntry.startTime
              ? new Date(editingEntry.startTime).toISOString()
              : undefined,
          }}
          onSave={handleSaveEntryEdit}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* Delete Time Entry Confirmation Dialog */}
      <ConfirmDialog
        open={deletingEntryId !== null}
        title="Delete Time Entry"
        message="Are you sure you want to delete this time entry? This action cannot be undone."
        onConfirm={handleConfirmEntryDelete}
        onClose={() => setDeletingEntryId(null)}
        confirmLabel="Delete"
        severity="error"
      />

      {/* Upgrade Dialog */}
      <UpgradeDialog
        open={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        onUpgrade={handleUpgrade}
        currentSku={subscription?.sku}
        featureName="Unlimited Tasks"
        requiredSku="pro-lifetime"
      />
    </Box>
  );
}
