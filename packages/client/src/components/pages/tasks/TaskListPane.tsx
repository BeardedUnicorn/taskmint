import { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  IconButton,
  Button,
  Divider,
  Chip,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  Assignment as TaskIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { EmptyState } from '../../ui/display/EmptyState';
import { formatCurrency } from '../../../utils/formatters';
import { SearchListHeader } from '../../ui';
import { useCompactLayout } from '../../../hooks/useCompactLayout';

/** A phone's menu of one task's actions: Edit, Archive or Unarchive, and Delete. */
function TaskActionsMenu({
  task,
  anchor,
  onClose,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  task: Task;
  anchor: HTMLElement | null;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onArchive: (task: Task) => void;
  onUnarchive: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  /** Closes the menu, then acts on its task. */
  const run = (action: (task: Task) => void) => () => {
    onClose();
    action(task);
  };
  return (
    <Menu anchorEl={anchor} open={anchor !== null} onClose={onClose}>
      <MenuItem onClick={run(onEdit)}>
        <ListItemIcon>
          <EditIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Edit</ListItemText>
      </MenuItem>
      {task.isArchived ? (
        <MenuItem onClick={run(onUnarchive)}>
          <ListItemIcon>
            <UnarchiveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Unarchive</ListItemText>
        </MenuItem>
      ) : (
        <MenuItem onClick={run(onArchive)}>
          <ListItemIcon>
            <ArchiveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Archive</ListItemText>
        </MenuItem>
      )}
      <Divider />
      <MenuItem onClick={run(onDelete)} sx={{ color: 'error.main' }}>
        <ListItemIcon sx={{ color: 'inherit' }}>
          <DeleteIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>
    </Menu>
  );
}

interface TaskListPaneProps {
  tasks: Task[];
  selectedTask: Task | null;
  onSelectTask: (task: Task) => void;
  onAddClick: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onArchiveTask: (task: Task) => void;
  onUnarchiveTask: (task: Task) => void;
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
  // A phone keeps each row's actions behind one button: three icons a row,
  // a red Delete on every one, crowded the list and put Delete a slip away
  const compact = useCompactLayout();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Kept after the menu closes, so it fades out with its own items
  const [menuTask, setMenuTask] = useState<Task | null>(null);
  const closeMenu = () => setMenuAnchor(null);

  // Filter by search first so it spans both sections, then partition
  const filteredTasks = tasks.filter(task => task.name.toLowerCase().includes(searchQuery.toLowerCase()));
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
                  <Chip label="No rate set" size="small" color="default" variant="outlined" />
                )}
              </Box>
              {compact ? (
                <IconButton
                  aria-label={`Actions for ${task.name}`}
                  aria-haspopup="menu"
                  onClick={event => {
                    event.stopPropagation();
                    setMenuAnchor(event.currentTarget);
                    setMenuTask(task);
                  }}
                >
                  <MoreIcon />
                </IconButton>
              ) : (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    aria-label="Edit task"
                    onClick={e => {
                      e.stopPropagation();
                      onEditTask(task);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  {task.isArchived ? (
                    <Tooltip title="Unarchive task">
                      <IconButton
                        size="small"
                        aria-label="Unarchive task"
                        onClick={e => {
                          e.stopPropagation();
                          onUnarchiveTask(task);
                        }}
                      >
                        <UnarchiveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Archive task">
                      <IconButton
                        size="small"
                        aria-label="Archive task"
                        onClick={e => {
                          e.stopPropagation();
                          onArchiveTask(task);
                        }}
                      >
                        <ArchiveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <IconButton
                    size="small"
                    color="error"
                    aria-label="Delete task"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteTask(task.id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
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
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onAddClick}>
            Add Task
          </Button>
        }
      />

      {/* Task List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredTasks.length === 0 ? (
          tasks.length === 0 ? (
            <EmptyState
              plain
              icon={<TaskIcon />}
              title="No tasks created yet"
              description="Add one to start tracking time."
            />
          ) : (
            <EmptyState plain title="No tasks match your search criteria" description="Try another search." />
          )
        ) : (
          <List sx={{ py: 0 }}>
            {activeTasks.map((task, index) => renderTaskRow(task, index < activeTasks.length - 1))}

            {archivedTasks.length > 0 && (
              <>
                {activeTasks.length > 0 && <Divider />}
                <ListSubheader disableSticky sx={{ bgcolor: 'transparent' }}>
                  Archived ({archivedTasks.length})
                </ListSubheader>
                {archivedTasks.map((task, index) => renderTaskRow(task, index < archivedTasks.length - 1))}
              </>
            )}
          </List>
        )}
      </Box>

      {menuTask && (
        <TaskActionsMenu
          task={menuTask}
          anchor={menuAnchor}
          onClose={closeMenu}
          onEdit={onEditTask}
          onArchive={onArchiveTask}
          onUnarchive={onUnarchiveTask}
          onDelete={task => onDeleteTask(task.id)}
        />
      )}
    </Box>
  );
}
