import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import type { BackupFile } from '../../../hooks/useDataBackup';
import { formatDateTime } from '../../../utils/locale';

interface RestoreBackupDialogProps {
  backup: BackupFile;
  restoring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function count(items: unknown[] | undefined, one: string, many: string): string {
  const n = items?.length ?? 0;
  return `${n} ${n === 1 ? one : many}`;
}

/** Asks before an exact restore, which replaces everything with the backup's data. */
export function RestoreBackupDialog({ backup, restoring, onCancel, onConfirm }: RestoreBackupDialogProps) {
  const { data, exportDate } = backup;
  const hasSettings = Object.values(data.settings ?? {}).some(setting => setting !== undefined);
  return (
    <Dialog open onClose={restoring ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Restore this backup exactly?</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your current data is replaced with the backup&apos;s. Anything added or changed since it was made is lost.
        </Alert>
        <DialogContentText component="div">
          {exportDate ? `The backup was made ${formatDateTime(exportDate)}. It has:` : 'The backup has:'}
          <Box component="ul" sx={{ mt: 1, mb: 1, pl: 3 }}>
            <li>{count(data.tasks, 'task', 'tasks')}</li>
            <li>{count(data.sessions, 'session', 'sessions')}</li>
            <li>{count(data.workLogs?.entries, 'imported work-log entry', 'imported work-log entries')}</li>
            <li>{count(data.taskNotes, 'note', 'notes')}</li>
            <li>{count(data.withdrawals, 'withdrawal', 'withdrawals')}</li>
          </Box>
          {hasSettings &&
            "This device's settings (appearance, notifications, idle and reminders, backups) are set to the backup's too. "}
          Export your data first if you might want it back. The app reloads afterwards.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="secondary" disabled={restoring}>
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" color="warning" disabled={restoring}>
          {restoring ? 'Restoring...' : 'Replace My Data'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
