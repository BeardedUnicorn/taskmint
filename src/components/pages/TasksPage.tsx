import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
} from '@mui/material';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';
import { TaskListPane } from './tasks/TaskListPane';
import { TaskDetailPane } from './tasks/TaskDetailPane';
import { TaskNotesIntegration } from '../features/tasks/TaskNotesIntegration';
import { EditTaskDialog } from './tasks/EditTaskDialog';
import { ConfirmDialog } from '../ui';

interface TasksPageProps {
  tasks: Task[];
  timeEntries: TimeEntry[];
  onAddTask: (taskData: { name: string; hourlyRate?: number }) => Promise<Task | null>;
  onUpdateTask?: (taskId: string, updates: { name: string; hourlyRate?: number }) => Promise<Task | null>;
  onDeleteTask?: (taskId: string) => Promise<void>;
}

export function TasksPage({
  tasks,
  timeEntries,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: TasksPageProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(tasks.length > 0 ? tasks[0] : null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Update selected task when tasks change
  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTask(null);
    } else if (!selectedTask || !tasks.find(t => t.id === selectedTask.id)) {
      // If no task is selected or the selected task no longer exists, select the first one
      setSelectedTask(tasks[0]);
    }
  }, [tasks, selectedTask]);

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
  };

  const handleDeleteTask = (taskId: string) => {
    setDeletingTaskId(taskId);
  };

  const handleSaveEdit = async (taskId: string, updates: { name: string; hourlyRate?: number }) => {
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

      {/* Three-Pane Layout */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', px: 3, pb: 3, gap: 2 }}>
        {/* Left Pane - Task List */}
        <Paper
          elevation={1}
          sx={{
            width: 350,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid',
            borderColor: 'divider',
          }}
        >
          <TaskListPane
            tasks={tasks}
            selectedTask={selectedTask}
            onSelectTask={handleSelectTask}
            onAddTask={onAddTask}
            onEditTask={onUpdateTask ? handleEditTask : undefined}
            onDeleteTask={onDeleteTask ? handleDeleteTask : undefined}
          />
        </Paper>

        {/* Middle Pane - Task Detail */}
        <Paper
          elevation={1}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRight: '1px solid',
            borderColor: 'divider',
          }}
        >
          {selectedTask ? (
            <TaskDetailPane
              task={selectedTask}
              timeEntries={timeEntries}
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
                  Choose a task from the list on the left to view its details and time entries.
                </Typography>
              </Alert>
            </Box>
          )}
        </Paper>

        {/* Right Pane - Task Notes */}
        <Paper
          elevation={1}
          sx={{
            width: 450,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {selectedTask ? (
            <TaskNotesIntegration task={selectedTask} />
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
              <Alert severity="info" sx={{ maxWidth: 350 }}>
                <Typography variant="h6" gutterBottom>
                  Task Notes
                </Typography>
                <Typography variant="body2">
                  Select a task to view and manage its notes.
                </Typography>
              </Alert>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Edit Task Dialog */}
      <EditTaskDialog
        open={editingTask !== null}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveEdit}
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
    </Box>
  );
}
