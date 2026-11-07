import { useCallback, useState } from 'react';
import { CORE_ERROR_PARTS } from '@taskmint/contracts';
import { StorageService } from '../services/StorageService';
import { BACKUP_FORMAT_VERSION, BackupFileSchema } from '../types/backup';
import { getBackend } from '../backend';
import { errorMessage } from '../utils/errors';

/**
 * One list section of a backup file into storage. Replace takes the file's
 * list as it is (none: empty). Merge keeps what's stored and adds the file's
 * items whose key isn't stored yet; a missing section changes nothing.
 */
async function importList<T>(
  mode: 'merge' | 'replace',
  incoming: T[] | undefined,
  read: () => Promise<T[]>,
  write: (items: T[]) => Promise<void>,
  key: (item: T) => string
): Promise<void> {
  if (mode === 'replace') {
    await write(incoming ?? []);
    return;
  }
  if (!incoming) return;
  const existing = await read();
  const stored = new Set(existing.map(key));
  await write([...existing, ...incoming.filter(item => !stored.has(key(item)))]);
}

interface UseDataBackupProps {
  /** Called with where the file was saved (none when it was a browser download). */
  onExportSuccess?: (path?: string) => void;
  onExportError?: (error: string) => void;
  onImportSuccess?: (result: any) => void;
  onImportError?: (error: string) => void;
}

export const useDataBackup = ({
  onExportSuccess,
  onExportError,
  onImportSuccess,
  onImportError,
}: UseDataBackupProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Reads everything fresh each call; stable so schedules can depend on it
  const createBackupData = useCallback(async () => {
    const storageService = StorageService.getInstance();

    try {
      const [tasks, noteTemplates, taskNotes, dailyGoal, goalAchievements, sessions, workLogs] = await Promise.all([
        storageService.getTasks(),
        storageService.getNoteTemplates(),
        storageService.getTaskNotes(),
        storageService.getDailyGoal(),
        storageService.getGoalAchievements(),
        // Tracked time and the work-log ledger live in the backend. A failed
        // read fails the backup rather than produce a file with no tracked
        // time in it.
        getBackend().call('get_sessions'),
        getBackend().call('get_work_logs'),
      ]);

      return {
        version: BACKUP_FORMAT_VERSION,
        exportDate: new Date().toISOString(),
        data: {
          tasks,
          noteTemplates,
          taskNotes,
          dailyGoal,
          goalAchievements,
          sessions,
          workLogs: {
            entries: workLogs.entries,
            mappings: workLogs.mappings,
          },
        },
      };
    } catch (error) {
      console.error('Failed to create backup data:', error);
      throw new Error('Failed to gather data for export');
    }
  }, []);

  const exportData = async () => {
    if (isExporting) return;

    setIsExporting(true);

    try {
      // Create the backup data
      const backupData = await createBackupData();
      const dataJson = JSON.stringify(backupData, null, 2);

      // Generate suggested filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const suggestedFilename = `taskmint_export_${timestamp}.json`;

      // Asks where to save it, then writes it. Dismissing the dialog is not
      // an error: nothing to report.
      const saved = await getBackend().platform.files.save({
        contents: dataJson,
        suggestedName: suggestedFilename,
        format: 'json',
      });
      if (!saved) return;

      onExportSuccess?.(saved.kind === 'path' ? saved.path : undefined);
    } catch (error) {
      console.error('Export failed:', error);
      onExportError?.(errorMessage(error, 'Failed to export data'));
    } finally {
      setIsExporting(false);
    }
  };

  const importData = async (mode: 'merge' | 'replace' = 'merge') => {
    if (isImporting) return;

    setIsImporting(true);

    try {
      // Asks for the file and reads it. Dismissing the dialog is not an
      // error: nothing to report.
      const fileContents = await getBackend().platform.files.openJson();
      if (fileContents === null) return;

      const parsed = BackupFileSchema.safeParse(JSON.parse(fileContents));
      if (!parsed.success) {
        throw new Error('Invalid backup file format: this is not a TaskMint export');
      }
      const { data, exportDate } = parsed.data;

      // Sessions and work logs first: the backend's restore keeps safety
      // copies of both before changing them. A section the file lacks (v1
      // exports have no work logs) is sent as null and left untouched.
      const restored = await getBackend().call('restore_backup_data', {
        payload: {
          mode,
          sessions: data.sessions ?? null,
          workLogEntries: data.workLogs?.entries ?? null,
          workLogMappings: data.workLogs?.mappings ?? null,
          exportedAt: exportDate ?? null,
        },
      });

      const storageService = StorageService.getInstance();

      // A file's timeEntries section (from versions that kept time entries
      // in localStorage) is ignored: tracked time is the sessions above.

      const byId = <T extends { id: string }>(item: T) => item.id;
      await importList(
        mode,
        data.tasks,
        () => storageService.getTasks(),
        items => storageService.setTasks(items),
        byId
      );
      await importList(
        mode,
        data.noteTemplates,
        () => storageService.getNoteTemplates(),
        items => storageService.setNoteTemplates(items),
        byId
      );
      await importList(
        mode,
        data.taskNotes,
        () => storageService.getTaskNotes(),
        items => storageService.setTaskNotes(items),
        byId
      );
      if (data.dailyGoal) {
        await storageService.setDailyGoal(data.dailyGoal);
      }
      // One achievement per day
      await importList(
        mode,
        data.goalAchievements,
        () => storageService.getGoalAchievements(),
        items => storageService.setGoalAchievements(items),
        achievement => achievement.date
      );

      onImportSuccess?.({
        mode,
        importedCounts: {
          tasks: data.tasks?.length ?? 0,
          noteTemplates: data.noteTemplates?.length ?? 0,
          taskNotes: data.taskNotes?.length ?? 0,
          goalAchievements: data.goalAchievements?.length ?? 0,
          sessions: restored.sessionsRestored,
          workLogEntries: restored.workLogEntriesRestored,
        },
        recordsSkipped: restored.recordsSkipped,
      });
    } catch (error) {
      console.error('Import failed:', error);
      // The backend rejects with plain strings, so read the reason either way
      const reason = errorMessage(error, 'Failed to import data');
      onImportError?.(
        reason.includes(CORE_ERROR_PARTS.INVALID_JSON)
          ? 'Invalid file format. Please select a valid TaskMint export file.'
          : reason
      );
    } finally {
      setIsImporting(false);
    }
  };

  return {
    exportData,
    importData,
    isExporting,
    isImporting,
    createBackupData,
  };
};
