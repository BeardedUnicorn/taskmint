import { Task } from '../../../types/task';
import { TaskFormDialog } from './TaskFormDialog';

interface AddTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (taskData: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null; parentId?: string | null }) => Promise<Task | null>;
  availableTasks?: Task[];
}

export function AddTaskDialog({ open, onClose, onSave, availableTasks = [] }: AddTaskDialogProps) {
  return (
    <TaskFormDialog
      open={open}
      onClose={onClose}
      mode="add"
      initialTask={null}
      availableTasks={availableTasks}
      onSubmit={onSave}
    />
  );
}

