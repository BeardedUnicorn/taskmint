/**
 * Virtualized List Components
 * 
 * This file contains virtualized list components using react-window for
 * performance optimization when rendering large datasets.
 */

import { memo, useMemo } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { Box, Typography, Paper } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { ActionButton } from './buttons/ActionButton';

// Common virtualized list props
interface VirtualizedListProps {
  height: number;
  width?: number | string;
  itemSize: number;
  overscanCount?: number;
  className?: string;
}

// Time Entry List Item Component
interface TimeEntryItemProps extends ListChildComponentProps {
  data: {
    entries: TimeEntry[];
    tasks?: Task[];
    onEdit?: (entry: TimeEntry) => void;
    onDelete?: (entryId: string) => void;
    formatDuration: (ms: number) => string;
    calculateEarnings?: (durationMs: number, hourlyRate?: number) => number | undefined;
  };
}

const TimeEntryItem = memo(({ index, style, data }: TimeEntryItemProps) => {
  const { entries, tasks, onEdit, onDelete, formatDuration, calculateEarnings } = data;
  const entry = entries[index];

  if (!entry) {
    return (
      <div style={style}>
        <Box p={2}>
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        </Box>
      </div>
    );
  }

  const duration = entry.duration || 0;

  // Find the task to get the correct hourly rate
  const task = tasks?.find(t => t.id === entry.taskId || t.name === entry.taskName);
  const hourlyRate = task?.hourlyRate;

  const earnings = calculateEarnings && hourlyRate ? calculateEarnings(duration, hourlyRate) : undefined;

  return (
    <div style={style}>
      <Paper
        elevation={1}
        sx={{
          m: 1,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          '&:hover': {
            elevation: 2,
            backgroundColor: 'action.hover',
          },
        }}
      >
        <Box flex={1}>
          <Typography variant="subtitle1" fontWeight="medium">
            {entry.taskName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {entry.date} • {formatDuration(duration)}
            {earnings && ` • $${earnings.toFixed(2)}`}
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          {onEdit && (
            <ActionButton
              onClick={() => onEdit(entry)}
              icon={<EditIcon fontSize="small" />}
              variant="text"
              size="small"
              color="primary"
              tooltip="Edit Entry"
            />
          )}
          {onDelete && (
            <ActionButton
              onClick={() => onDelete(entry.id)}
              icon={<DeleteIcon fontSize="small" />}
              variant="text"
              size="small"
              color="error"
              tooltip="Delete Entry"
            />
          )}
        </Box>
      </Paper>
    </div>
  );
});

TimeEntryItem.displayName = 'TimeEntryItem';

// Virtualized Time Entry List
interface VirtualizedTimeEntryListProps extends VirtualizedListProps {
  entries: TimeEntry[];
  tasks?: Task[];
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (entryId: string) => void;
  formatDuration: (ms: number) => string;
  calculateEarnings?: (durationMs: number, hourlyRate?: number) => number | undefined;
  emptyMessage?: string;
}

export const VirtualizedTimeEntryList = memo(({
  entries,
  tasks,
  height,
  width = '100%',
  itemSize = 80,
  overscanCount = 5,
  onEdit,
  onDelete,
  formatDuration,
  calculateEarnings,
  emptyMessage = 'No time entries found',
  className,
}: VirtualizedTimeEntryListProps) => {
  const itemData = useMemo(() => ({
    entries,
    tasks,
    onEdit,
    onDelete,
    formatDuration,
    calculateEarnings,
  }), [entries, tasks, onEdit, onDelete, formatDuration, calculateEarnings]);

  if (entries.length === 0) {
    return (
      <Box
        height={height}
        display="flex"
        alignItems="center"
        justifyContent="center"
        className={className}
      >
        <Typography variant="body1" color="text.secondary">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={className}>
      <List
        height={height}
        width={width}
        itemCount={entries.length}
        itemSize={itemSize}
        itemData={itemData}
        overscanCount={overscanCount}
      >
        {TimeEntryItem}
      </List>
    </Box>
  );
});

VirtualizedTimeEntryList.displayName = 'VirtualizedTimeEntryList';



// Task List Item Component
interface TaskItemProps extends ListChildComponentProps {
  data: {
    tasks: Task[];
    onEdit?: (task: Task) => void;
    onDelete?: (taskId: string) => void;
    onSelect?: (task: Task) => void;
  };
}

const TaskItem = memo(({ index, style, data }: TaskItemProps) => {
  const { tasks, onEdit, onDelete, onSelect } = data;
  const task = tasks[index];

  if (!task) {
    return (
      <div style={style}>
        <Box p={2}>
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        </Box>
      </div>
    );
  }

  return (
    <div style={style}>
      <Paper
        elevation={1}
        sx={{
          m: 1,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: onSelect ? 'pointer' : 'default',
          '&:hover': {
            elevation: 2,
            backgroundColor: 'action.hover',
          },
        }}
        onClick={() => onSelect?.(task)}
      >
        <Box flex={1}>
          <Typography variant="subtitle1" fontWeight="medium">
            {task.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {task.hourlyRate ? `$${task.hourlyRate}/hour` : 'No rate set'}
          </Typography>
        </Box>
        <Box display="flex" gap={1} onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <ActionButton
              onClick={() => onEdit(task)}
              icon={<EditIcon fontSize="small" />}
              variant="text"
              size="small"
              color="primary"
              tooltip="Edit Task"
            />
          )}
          {onDelete && (
            <ActionButton
              onClick={() => onDelete(task.id)}
              icon={<DeleteIcon fontSize="small" />}
              variant="text"
              size="small"
              color="error"
              tooltip="Delete Task"
            />
          )}
        </Box>
      </Paper>
    </div>
  );
});

TaskItem.displayName = 'TaskItem';

// Virtualized Task List
interface VirtualizedTaskListProps extends VirtualizedListProps {
  tasks: Task[];
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  onSelect?: (task: Task) => void;
  emptyMessage?: string;
}

export const VirtualizedTaskList = memo(({
  tasks,
  height,
  width = '100%',
  itemSize = 80,
  overscanCount = 5,
  onEdit,
  onDelete,
  onSelect,
  emptyMessage = 'No tasks found',
  className,
}: VirtualizedTaskListProps) => {
  const itemData = useMemo(() => ({
    tasks,
    onEdit,
    onDelete,
    onSelect,
  }), [tasks, onEdit, onDelete, onSelect]);

  if (tasks.length === 0) {
    return (
      <Box
        height={height}
        display="flex"
        alignItems="center"
        justifyContent="center"
        className={className}
      >
        <Typography variant="body1" color="text.secondary">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={className}>
      <List
        height={height}
        width={width}
        itemCount={tasks.length}
        itemSize={itemSize}
        itemData={itemData}
        overscanCount={overscanCount}
      >
        {TaskItem}
      </List>
    </Box>
  );
});

VirtualizedTaskList.displayName = 'VirtualizedTaskList';

export default VirtualizedTimeEntryList;
