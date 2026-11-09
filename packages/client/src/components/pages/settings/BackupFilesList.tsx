import { useEffect, useState } from 'react';
import { Alert, Box, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { getBackend } from '../../../backend';
import type { FolderBackupPlatform } from '../../../backend';
import { useNotification } from '../../../contexts/NotificationContext';
import { parseBackupFile, useDataBackup, type BackupFile, type RestoreMode } from '../../../hooks/useDataBackup';
import type { BackupFileInfo } from '../../../types/backup';
import { errorMessage } from '../../../utils/errors';
import { formatDateTime, formatFileSize } from '../../../utils/locale';
import { RestoreBackupDialog } from './RestoreBackupDialog';
import { useImportOutcome } from './useImportOutcome';

interface BackupFilesListProps {
  folder: string;
  /** When the latest backup was made: the list is read again after one. */
  lastBackupTime?: string;
}

/** The backup section is shown only where there are folder backups. */
const folders = () => getBackend().platform.folderBackups as FolderBackupPlatform;

/** The backups in the backup folder, each to restore exactly or merge in. */
export function BackupFilesList({ folder, lastBackupTime }: BackupFilesListProps) {
  const { showError } = useNotification();
  const [files, setFiles] = useState<BackupFileInfo[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // A backup read for an exact restore, waiting to be confirmed
  const [toRestore, setToRestore] = useState<BackupFile | null>(null);
  const { restoreBackup, isImporting } = useDataBackup(useImportOutcome());

  useEffect(() => {
    let current = true;
    folders()
      .list(folder)
      .then(
        listed => ({ listed, error: null }),
        error => ({ listed: null, error: errorMessage(error, "Couldn't read the backup folder") })
      )
      .then(({ listed, error }) => {
        // A list for a folder since changed comes too late
        if (!current) return;
        setFiles(listed);
        setListError(error);
      });
    return () => {
      current = false;
    };
  }, [folder, lastBackupTime]);

  /** Reads a backup to restore; null (with the reason shown) when it can't be. */
  const read = async (file: BackupFileInfo): Promise<BackupFile | null> => {
    try {
      return parseBackupFile(await folders().read(folder, file.name));
    } catch (error) {
      showError(errorMessage(error, "Couldn't read that backup"));
      return null;
    }
  };

  const handle = async (file: BackupFileInfo, mode: RestoreMode) => {
    const backup = await read(file);
    if (!backup) return;
    // Merging adds only what isn't here, as Import Data does; replacing asks first
    if (mode === 'merge') await restoreBackup(backup, 'merge');
    else setToRestore(backup);
  };

  // On success the app reloads; on failure the dialog closes
  const handleConfirmRestore = async (backup: BackupFile) => {
    await restoreBackup(backup, 'replace');
    setToRestore(null);
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Backups in This Folder
      </Typography>
      {listError && <Alert severity="error">{listError}</Alert>}
      {files?.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No backups here yet.
        </Typography>
      )}
      {files && files.length > 0 && (
        <List dense disablePadding aria-label="Backups in this folder">
          {files.map(file => (
            <ListItem
              key={file.name}
              disableGutters
              secondaryAction={
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={() => void handle(file, 'replace')}
                    disabled={!file.valid || isImporting}
                    aria-label={`Restore the backup from ${formatDateTime(file.takenAt)} exactly`}
                  >
                    Restore exactly
                  </Button>
                  <Button
                    size="small"
                    onClick={() => void handle(file, 'merge')}
                    disabled={!file.valid || isImporting}
                    aria-label={`Merge in the backup from ${formatDateTime(file.takenAt)}`}
                  >
                    Merge
                  </Button>
                </Stack>
              }
              sx={{ pr: 26 }}
            >
              <ListItemText
                primary={formatDateTime(file.takenAt)}
                secondary={file.valid ? formatFileSize(file.size) : `${formatFileSize(file.size)} · ${file.problem}`}
                slotProps={{ secondary: { color: file.valid ? 'text.secondary' : 'error' } }}
              />
            </ListItem>
          ))}
        </List>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Restore exactly replaces everything here with the backup&apos;s, this device&apos;s settings included. Merge
        adds what isn&apos;t here yet, as Import Data does. The app reloads afterwards.
      </Typography>

      {toRestore && (
        <RestoreBackupDialog
          backup={toRestore}
          restoring={isImporting}
          onCancel={() => setToRestore(null)}
          onConfirm={() => void handleConfirmRestore(toRestore)}
        />
      )}
    </Box>
  );
}
