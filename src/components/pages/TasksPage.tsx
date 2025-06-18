import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
} from '@mui/material';
import { Task } from '../../types/task';
import { TimeEntry } from '../../types/timer';
import { TaskListPane } from './tasks/TaskListPane';
import { TaskDetailEnhanced } from './tasks/TaskDetailEnhanced';

interface TasksPageProps {
  tasks: Task[];
  timeEntries: TimeEntry[];
  onAddTask: (taskData: { name: string; hourlyRate?: number }) => Promise<Task | null>;
}

export function TasksPage({
  tasks,
  timeEntries,
  onAddTask,
}: TasksPageProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
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

      {/* Two-Pane Layout */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', px: 3, pb: 3 }}>
        {/* Left Pane - Task List */}
        <Paper
          elevation={1}
          sx={{
            width: '400px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            mr: 3,
          }}
        >
          <TaskListPane
            tasks={tasks}
            selectedTask={selectedTask}
            onSelectTask={handleSelectTask}
            onAddTask={onAddTask}
          />
        </Paper>

        {/* Right Pane - Task Detail */}
        <Paper
          elevation={1}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {selectedTask ? (
            <TaskDetailEnhanced
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
      </Box>
    </Box>
  );
}
