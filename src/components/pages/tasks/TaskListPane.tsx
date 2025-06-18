import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Divider,
  Chip,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { AddTaskDialog } from './AddTaskDialog';
import { formatCurrency } from '../../../utils/formatters';

interface TaskListPaneProps {
  tasks: Task[];
  selectedTask: Task | null;
  onSelectTask: (task: Task) => void;
  onAddTask: (taskData: { name: string; hourlyRate?: number }) => Promise<Task | null>;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
}

export function TaskListPane({
  tasks,
  selectedTask,
  onSelectTask,
  onAddTask,
  onEditTask,
  onDeleteTask,
}: TaskListPaneProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);

  // Filter tasks based on search query
  const filteredTasks = tasks.filter(task =>
    task.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddTask = async (taskData: { name: string; hourlyRate?: number }) => {
    const newTask = await onAddTask(taskData);
    if (newTask) {
      setShowNewTaskDialog(false);
      // Optionally select the newly created task
      onSelectTask(newTask);
    }
    return newTask;
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Task List
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowNewTaskDialog(true)}
          >
            Add Task
          </Button>
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Task List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredTasks.length === 0 ? (
          <Box sx={{ p: 3 }}>
            {tasks.length === 0 ? (
              <Alert severity="info">
                <Typography variant="body2">
                  No tasks created yet. Click "Add Task" to get started!
                </Typography>
              </Alert>
            ) : (
              <Alert severity="info">
                <Typography variant="body2">
                  No tasks match your search criteria.
                </Typography>
              </Alert>
            )}
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {filteredTasks.map((task, index) => (
              <Box key={task.id}>
                <ListItemButton
                  selected={selectedTask?.id === task.id}
                  onClick={() => onSelectTask(task)}
                  sx={{
                    py: 2,
                    '&.Mui-selected': {
                      backgroundColor: 'primary.dark',
                      color: 'primary.contrastText',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                      '& .MuiTypography-root': {
                        color: 'primary.contrastText',
                      },
                      '& .MuiChip-root': {
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        color: 'primary.contrastText',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                      },
                      '& .MuiIconButton-root': {
                        color: 'primary.contrastText',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        },
                      },
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {task.name}
                      </Typography>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          {task.hourlyRate && task.hourlyRate > 0 ? (
                            <Chip
                              label={`${formatCurrency(task.hourlyRate)}/hr`}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          ) : (
                            <Chip
                              label="No rate set"
                              size="small"
                              color="default"
                              variant="outlined"
                            />
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {onEditTask && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTask(task);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          )}
                          {onDeleteTask && (
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTask(task.id);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </Box>
                    }
                  />
                </ListItemButton>
                
                {index < filteredTasks.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        )}
      </Box>

      {/* Add Task Dialog */}
      <AddTaskDialog
        open={showNewTaskDialog}
        onClose={() => setShowNewTaskDialog(false)}
        onSave={handleAddTask}
      />
    </Box>
  );
}
