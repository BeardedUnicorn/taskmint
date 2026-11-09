import { useCallback, useState } from 'react';
import { z } from 'zod';
import { CORE_ERROR_PARTS, type JsonValue } from '@taskmint/contracts';
import { StorageService } from '../services/StorageService';
import { flushAppRecords, type AppRecordKey } from '../services/appRecords';
import { BACKUP_FORMAT_VERSION, BackupFileSchema } from '../types/backup';
import { AccountSettingsSchema, DEFAULT_ACCOUNT_SETTINGS } from '../types/accountSettings';
import { TaskSchema } from '../types/task';
import { NoteTemplateSchema, TaskNoteSchema } from '../types/notes';
import { DailyGoalAchievementSchema, DailyGoalSchema } from '../types/goal';
import { WithdrawalListSchema } from '../types/withdrawal';
import { STORAGE_KEYS } from '../constants';
import { getBackend } from '../backend';
import { errorMessage } from '../utils/errors';
import { applyDeviceSettings, readDeviceSettings } from '../utils/deviceSettings';

export type RestoreMode = 'merge' | 'replace';

/** A backup file, read and checked: ready to restore. */
export type BackupFile = z.infer<typeof BackupFileSchema>;

/** What an import or a restore brought in, for its callback. */
export interface ImportResult {
  mode: RestoreMode;
  importedCounts: {
    tasks: number;
    noteTemplates: number;
    taskNotes: number;
    goalAchievements: number;
    withdrawals: number;
    sessions: number;
    workLogEntries: number;
  };
  /** Sessions and work-log records in the file that couldn't be read. */
  recordsSkipped: number;
}

/**
 * A backup file's text, read and checked. Throws, saying why, when it isn't
 * a TaskMint export.
 */
export function parseBackupFile(contents: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(contents);
  } catch {
    throw new Error('This file is not valid JSON');
  }
  const parsed = BackupFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('Invalid backup file format: this is not a TaskMint export');
  }
  return parsed.data;
}

type BackupData = BackupFile['data'];

/** The records a backup file can hold: its section, the record, and what the record must be. */
const RECORD_SECTIONS: ReadonlyArray<{
  section: keyof BackupData;
  key: AppRecordKey;
  label: string;
  schema: z.ZodType;
}> = [
  { section: 'tasks', key: STORAGE_KEYS.PREDEFINED_TASKS, label: 'tasks', schema: z.array(TaskSchema) },
  {
    section: 'noteTemplates',
    key: STORAGE_KEYS.NOTE_TEMPLATES,
    label: 'note templates',
    schema: z.array(NoteTemplateSchema),
  },
  { section: 'taskNotes', key: STORAGE_KEYS.TASK_NOTES, label: 'notes', schema: z.array(TaskNoteSchema) },
  { section: 'dailyGoal', key: STORAGE_KEYS.DAILY_GOAL, label: 'daily goal', schema: DailyGoalSchema.nullable() },
  {
    section: 'goalAchievements',
    key: STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS,
    label: 'goal history',
    schema: z.array(DailyGoalAchievementSchema),
  },
  { section: 'withdrawals', key: STORAGE_KEYS.WITHDRAWALS, label: 'withdrawals', schema: WithdrawalListSchema },
  {
    section: 'accountSettings',
    key: STORAGE_KEYS.ACCOUNT_SETTINGS,
    label: 'payout settings',
    schema: AccountSettingsSchema,
  },
];

/**
 * The records an exact restore puts in place, by record key, each checked
 * first: one that doesn't read refuses the restore before anything changes.
 * A section the file doesn't have (an older format) isn't listed, so that
 * record stays as it is.
 */
function recordsToRestore(data: BackupData): Record<string, JsonValue> {
  const records: Record<string, JsonValue> = {};
  for (const { section, key, label, schema } of RECORD_SECTIONS) {
    const value = data[section];
    if (value === undefined) continue;
    if (!schema.safeParse(value).success) {
      throw new Error(`The backup's ${label} can't be read, so nothing was restored`);
    }
    records[key] = value as JsonValue;
  }
  return records;
}

/**
 * One list section of a backup file merged into storage: what's stored
 * stays, and the file's items whose key isn't stored yet are added. A
 * missing section changes nothing.
 */
async function mergeList<T>(
  incoming: T[] | undefined,
  read: () => Promise<T[]>,
  write: (items: T[]) => Promise<void>,
  key: (item: T) => string
): Promise<void> {
  if (!incoming) return;
  const existing = await read();
  const stored = new Set(existing.map(key));
  await write([...existing, ...incoming.filter(item => !stored.has(key(item)))]);
}

/** A merge's records, item by item (the backend has merged the sessions and work logs). */
async function mergeRecords(data: BackupData): Promise<void> {
  const storageService = StorageService.getInstance();
  // A file's timeEntries section (from versions that kept time entries in
  // localStorage) is ignored: tracked time is the sessions.
  const byId = <T extends { id: string }>(item: T) => item.id;
  await mergeList(
    data.tasks,
    () => storageService.getTasks(),
    items => storageService.setTasks(items),
    byId
  );
  await mergeList(
    data.noteTemplates,
    () => storageService.getNoteTemplates(),
    items => storageService.setNoteTemplates(items),
    byId
  );
  await mergeList(
    data.taskNotes,
    () => storageService.getTaskNotes(),
    items => storageService.setTaskNotes(items),
    byId
  );
  if (data.dailyGoal) {
    await storageService.setDailyGoal(data.dailyGoal);
  }
  // One achievement per day
  await mergeList(
    data.goalAchievements,
    () => storageService.getGoalAchievements(),
    items => storageService.setGoalAchievements(items),
    achievement => achievement.date
  );
  await mergeList(
    data.withdrawals,
    () => storageService.getWithdrawals(),
    items => storageService.setWithdrawals(items),
    byId
  );
  // The payout settings come in only where none are set
  if (data.accountSettings !== undefined && (await storageService.getAccountSettings()) === null) {
    await storageService.setAccountSettings(data.accountSettings);
  }
}

/**
 * Restores a backup. A merge adds what isn't here yet and leaves this
 * device's settings alone. An exact restore (replace) puts the file's data in
 * place of what's here, in one backend change that keeps its own safety
 * copies, then the file's device settings.
 */
async function restore(backup: BackupFile, mode: RestoreMode): Promise<ImportResult> {
  const { data, exportDate } = backup;
  const records = mode === 'replace' ? recordsToRestore(data) : null;
  // A record write still in flight must land before the restore, not after
  if (records) await flushAppRecords();

  // Sessions and work logs first: the backend's restore keeps safety copies
  // before changing them. A section the file lacks (v1 exports have no work
  // logs) is sent as null and left untouched.
  const restored = await getBackend().call('restore_backup_data', {
    payload: {
      mode,
      sessions: data.sessions ?? null,
      workLogEntries: data.workLogs?.entries ?? null,
      workLogMappings: data.workLogs?.mappings ?? null,
      exportedAt: exportDate ?? null,
      ...(records ? { records } : {}),
    },
  });

  if (records) applyDeviceSettings(data.settings);
  else await mergeRecords(data);

  return {
    mode,
    importedCounts: {
      tasks: data.tasks?.length ?? 0,
      noteTemplates: data.noteTemplates?.length ?? 0,
      taskNotes: data.taskNotes?.length ?? 0,
      goalAchievements: data.goalAchievements?.length ?? 0,
      withdrawals: data.withdrawals?.length ?? 0,
      sessions: restored.sessionsRestored,
      workLogEntries: restored.workLogEntriesRestored,
    },
    recordsSkipped: restored.recordsSkipped,
  };
}

interface UseDataBackupProps {
  /** Called with where the file was saved (none when it was a browser download). */
  onExportSuccess?: (path?: string) => void;
  onExportError?: (error: string) => void;
  onImportSuccess?: (result: ImportResult) => void;
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
      const [
        tasks,
        noteTemplates,
        taskNotes,
        dailyGoal,
        goalAchievements,
        withdrawals,
        accountSettings,
        sessions,
        workLogs,
      ] = await Promise.all([
        storageService.getTasks(),
        storageService.getNoteTemplates(),
        storageService.getTaskNotes(),
        storageService.getDailyGoal(),
        storageService.getGoalAchievements(),
        storageService.getWithdrawals(),
        storageService.getAccountSettings(),
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
          withdrawals,
          accountSettings: accountSettings ?? DEFAULT_ACCOUNT_SETTINGS,
          // This device's own settings, for an exact restore
          settings: readDeviceSettings(),
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

  const reportImportError = (error: unknown) => {
    console.error('Import failed:', error);
    // The backend rejects with plain strings, so read the reason either way
    const reason = errorMessage(error, 'Failed to import data');
    onImportError?.(
      reason.includes(CORE_ERROR_PARTS.INVALID_JSON)
        ? 'Invalid file format. Please select a valid TaskMint export file.'
        : reason
    );
  };

  /** Asks for a file and reads it: null when the dialog is dismissed. */
  const openBackupFile = async (): Promise<BackupFile | null> => {
    const fileContents = await getBackend().platform.files.openJson();
    return fileContents === null ? null : parseBackupFile(fileContents);
  };

  /** Import Data: asks for a file and merges it in. */
  const importData = async () => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      const backup = await openBackupFile();
      if (backup) onImportSuccess?.(await restore(backup, 'merge'));
    } catch (error) {
      reportImportError(error);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Asks for a backup file to restore and reads it, to confirm first. Null
   * when the dialog is dismissed or the file isn't an export (reported to
   * onImportError).
   */
  const chooseBackupFile = async (): Promise<BackupFile | null> => {
    if (isImporting) return null;
    setIsImporting(true);
    try {
      return await openBackupFile();
    } catch (error) {
      reportImportError(error);
      return null;
    } finally {
      setIsImporting(false);
    }
  };

  /** Restores a backup read by chooseBackupFile or parseBackupFile. */
  const restoreBackup = async (backup: BackupFile, mode: RestoreMode) => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      onImportSuccess?.(await restore(backup, mode));
    } catch (error) {
      reportImportError(error);
    } finally {
      setIsImporting(false);
    }
  };

  return {
    exportData,
    importData,
    chooseBackupFile,
    restoreBackup,
    isExporting,
    isImporting,
    createBackupData,
  };
};
