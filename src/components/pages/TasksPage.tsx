import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';
import { TaskDetailPane } from './tasks/TaskDetailPane';
import { AddTaskDialog } from './tasks/AddTaskDialog';
import { EditTaskDialog } from './tasks/EditTaskDialog';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { ConfirmDialog, UpgradeDialog } from '../ui';
import { EditTimeEntryData } from '../../types/form';
import { useSubscription, useTaskLimit } from '../../contexts/SubscriptionContext';
import { formatDateTimeLocal } from '../../utils/dateHelpers';

interface TasksPageProps {
  tasks: Task[];
  timeEntries: TimeEntry[];
  onAddTask: (taskData: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => Promise<Task | null>;
  onUpdateTask?: (taskId: string, updates: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null }) => Promise<Task | null>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onUpdateEntry?: (entry: TimeEntry) => void;
  onDeleteEntry?: (entryId: string) => void;
}

export function TasksPage({
  tasks,
  timeEntries,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateEntry,
  onDeleteEntry,
}: TasksPageProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(tasks.length > 0 ? tasks[0] : null);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Subscription hooks
  const { subscription, upgradeSubscription } = useSubscription();
  const { canAddTask, currentCount, limit, reason, isLoading: limitLoading } = useTaskLimit(tasks);

  // Update selected task when tasks change
  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTask(null);
    } else if (!selectedTask || !tasks.find(t => t.id === selectedTask.id)) {
      // If no task is selected or the selected task no longer exists, select the first one
      setSelectedTask(tasks[0]);
    }
  }, [tasks, selectedTask]);

  const handleSelectTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    setSelectedTask(task || null);
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

    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    // Validate dates
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      console.error('Invalid date values provided');
      return;
    }

    const updatedEntry: TimeEntry = {
      ...editingEntry,
      taskName: data.taskName,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      date: startTime.toISOString().split('T')[0],
    };

    onUpdateEntry(updatedEntry);
    setEditingEntry(null);
  };

  const handleConfirmEntryDelete = () => {
    if (deletingEntryId && onDeleteEntry) {
      onDeleteEntry(deletingEntryId);
      setDeletingEntryId(null);
    }
  };

  const handleAddTaskClick = () => {
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

      {/* Task Selector */}
      <Box sx={{ px: 3, pb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <FormControl sx={{ minWidth: 300, flex: 1 }}>
          <InputLabel id="task-selector-label">Select Task</InputLabel>
          <Select
            labelId="task-selector-label"
            value={selectedTask ? selectedTask.id : ''}
            label="Select Task"
            onChange={(e) => handleSelectTask(e.target.value)}
            disabled={tasks.length === 0}
          >
            {tasks.length === 0 ? (
              <MenuItem value="" disabled>
                <em>No tasks available</em>
              </MenuItem>
            ) : (
              tasks.map((task) => (
                <MenuItem key={task.id} value={task.id}>
                  {task.name}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddTaskClick}
          disabled={limitLoading}
        >
          Add Task
        </Button>

        {selectedTask && onUpdateTask && (
          <IconButton
            onClick={() => setEditingTask(selectedTask)}
            color="primary"
            title="Edit Selected Task"
          >
            <EditIcon />
          </IconButton>
        )}
      </Box>

      {/* Main Content - Time Worked */}
      <Box sx={{ flex: 1, overflow: 'hidden', px: 3, pb: 3 }}>
        <Paper
          elevation={1}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
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
                flex: 1,
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
        </Paper>
      </Box>

      {/* Add Task Dialog */}
      <AddTaskDialog
        open={showNewTaskDialog}
        onClose={() => setShowNewTaskDialog(false)}
        onSave={handleAddTaskDialog}
        availableTasks={tasks}
      />

      {/* Edit Task Dialog */}
      <EditTaskDialog
        open={editingTask !== null}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveEdit}
        availableTasks={tasks}
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
            startTime: formatDateTimeLocal(editingEntry.startTime),
            endTime: editingEntry.endTime
              ? formatDateTimeLocal(editingEntry.endTime)
              : '',
          }}
          tasks={tasks}
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
