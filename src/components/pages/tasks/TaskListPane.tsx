import { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  IconButton,
  Button,
  Divider,
  Chip,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { formatCurrency } from '../../../utils/formatters';
import { SearchListHeader } from '../../ui';

interface TaskListPaneProps {
  tasks: Task[];
  selectedTask: Task | null;
  onSelectTask: (task: Task) => void;
  onAddClick: () => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onArchiveTask?: (task: Task) => void;
  onUnarchiveTask?: (task: Task) => void;
}

export function TaskListPane({
  tasks,
  selectedTask,
  onSelectTask,
  onAddClick,
  onEditTask,
  onDeleteTask,
  onArchiveTask,
  onUnarchiveTask,
}: TaskListPaneProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter by search first so it spans both sections, then partition
  const filteredTasks = tasks.filter(task =>
    task.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const activeTasks = filteredTasks.filter(task => !task.isArchived);
  const archivedTasks = filteredTasks.filter(task => task.isArchived);

  const renderTaskRow = (task: Task, showDivider: boolean) => (
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
          // The secondary content holds chips and buttons, so its wrapper
          // must be a div rather than the default <p>
          slotProps={{ secondary: { component: 'div' } }}
          primary={
            <Typography
              variant="body1"
              sx={{ fontWeight: 500, color: task.isArchived ? 'text.secondary' : 'text.primary' }}
            >
              {task.name}
              {task.isFavorite && (
                <Box component="span" aria-label="Favorite" sx={{ color: 'warning.main', ml: 0.75 }}>
                  ★
                </Box>
              )}
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
                    aria-label="Edit task"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTask(task);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
                {task.isArchived
                  ? onUnarchiveTask && (
                      <Tooltip title="Unarchive task">
                        <IconButton
                          size="small"
                          aria-label="Unarchive task"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUnarchiveTask(task);
                          }}
                        >
                          <UnarchiveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )
                  : onArchiveTask && (
                      <Tooltip title="Archive task">
                        <IconButton
                          size="small"
                          aria-label="Archive task"
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchiveTask(task);
                          }}
                        >
                          <ArchiveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                {onDeleteTask && (
                  <IconButton
                    size="small"
                    color="error"
                    aria-label="Delete task"
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

      {showDivider && <Divider />}
    </Box>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <SearchListHeader
        title="Task List"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search tasks..."
        actions={
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onAddClick}
          >
            Add Task
          </Button>
        }
      />

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
            {activeTasks.map((task, index) =>
              renderTaskRow(task, index < activeTasks.length - 1)
            )}

            {archivedTasks.length > 0 && (
              <>
                {activeTasks.length > 0 && <Divider />}
                <ListSubheader disableSticky sx={{ bgcolor: 'transparent' }}>
                  Archived ({archivedTasks.length})
                </ListSubheader>
                {archivedTasks.map((task, index) =>
                  renderTaskRow(task, index < archivedTasks.length - 1)
                )}
              </>
            )}
          </List>
        )}
      </Box>
    </Box>
  );
}
