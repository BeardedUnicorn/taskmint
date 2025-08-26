import { useState } from 'react';
import { TaskSelector } from '../forms/TaskSelector';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';
import { FormDialog } from './FormDialog';

interface QuickSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession>;
  tasks: Task[];
}

export function QuickSessionDialog({
  open,
  onClose,
  onStartSession,
  tasks,
}: QuickSessionDialogProps) {
  const [selectedTaskName, setSelectedTaskName] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleStart = () => {
    if (selectedTaskName.trim()) {
      onStartSession(selectedTask?.id || '', selectedTaskName.trim()).then(() => {
        onClose();
      });
    }
  };

  const handleClose = () => {
    setSelectedTaskName('');
    setSelectedTask(null);
    onClose();
  }

  const handleTaskChange = (name: string, task?: Task | null) => {
    setSelectedTaskName(name);
    setSelectedTask(task || null);
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Start a Quick Session"
      onSubmit={handleStart}
      submitLabel="Start Session"
      submitDisabled={!selectedTaskName.trim()}
    >
      <TaskSelector
        value={selectedTaskName}
        onChange={handleTaskChange}
        predefinedTasks={tasks}
        placeholder="Select a task to start"
      />
    </FormDialog>
  );
}
