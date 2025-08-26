import { Task } from '../../../types/task';
import { TaskFormDialog } from './TaskFormDialog';

interface EditTaskDialogProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (
    taskId: string,
    updates: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null; parentId?: string | null }
  ) => Promise<Task | null>;
  availableTasks?: Task[];
}

export function EditTaskDialog({ open, task, onClose, onSave, availableTasks = [] }: EditTaskDialogProps) {
  const handleSubmit = (data: {
    name: string;
    hourlyRate?: number;
    defaultNoteTemplateId?: string | null;
    parentId?: string | null;
  }) => {
    if (!task) return Promise.resolve(null);
    return onSave(task.id, data);
  };

  return (
    <TaskFormDialog
      open={open}
      onClose={onClose}
      mode="edit"
      initialTask={task}
      availableTasks={availableTasks}
      onSubmit={handleSubmit}
    />
  );
}

