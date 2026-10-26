import { useCallback, useState } from 'react';
import { CORE_ERROR_PARTS } from '@taskmint/contracts';
import { StorageService } from '../services/StorageService';
import { Task } from '../types/task';
import { NoteTemplate, TaskNote } from '../types/notes';
import { DailyGoalAchievement } from '../types/goal';
import { BACKUP_FORMAT_VERSION, BackupFileSchema } from '../types/backup';
import { getBackend } from '../backend';
import { errorMessage } from '../utils/errors';

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
  onImportError 
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
        sessions,
        workLogs
      ] = await Promise.all([
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
            entries: workLogs?.entries ?? [],
            mappings: workLogs?.mappings ?? [],
          },
        }
      };
    } catch (error) {
      // Only log in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to create backup data:', error);
      }
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
      // Only log in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('Export failed:', error);
      }
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

      // Handle tasks
      if (data.tasks && Array.isArray(data.tasks)) {
        if (mode === 'replace') {
          await storageService.setTasks(data.tasks);
        } else {
          // Merge mode: get existing tasks and merge (avoid duplicates by id)
          const existingTasks = await storageService.getTasks();
          const existingTaskIds = new Set(existingTasks.map(t => t.id));
          const newTasks = data.tasks.filter((t: Task) => !existingTaskIds.has(t.id));
          const mergedTasks = [...existingTasks, ...newTasks];
          await storageService.setTasks(mergedTasks);
        }
      } else if (mode === 'replace') {
        await storageService.setTasks([]);
      }
      
      // Handle note templates
      if (data.noteTemplates && Array.isArray(data.noteTemplates)) {
        if (mode === 'replace') {
          await storageService.setNoteTemplates(data.noteTemplates);
        } else {
          // Merge mode: get existing templates and merge (avoid duplicates by id)
          const existingTemplates = await storageService.getNoteTemplates();
          const existingTemplateIds = new Set(existingTemplates.map(t => t.id));
          const newTemplates = data.noteTemplates.filter((t: NoteTemplate) => !existingTemplateIds.has(t.id));
          const mergedTemplates = [...existingTemplates, ...newTemplates];
          await storageService.setNoteTemplates(mergedTemplates);
        }
      } else if (mode === 'replace') {
        await storageService.setNoteTemplates([]);
      }
      
      // Handle task notes
      if (data.taskNotes && Array.isArray(data.taskNotes)) {
        if (mode === 'replace') {
          await storageService.setTaskNotes(data.taskNotes);
        } else {
          // Merge mode: get existing notes and merge (avoid duplicates by id)
          const existingNotes = await storageService.getTaskNotes();
          const existingNoteIds = new Set(existingNotes.map(n => n.id));
          const newNotes = data.taskNotes.filter((n: TaskNote) => !existingNoteIds.has(n.id));
          const mergedNotes = [...existingNotes, ...newNotes];
          await storageService.setTaskNotes(mergedNotes);
        }
      } else if (mode === 'replace') {
        await storageService.setTaskNotes([]);
      }
      
      // Handle daily goal
      if (data.dailyGoal) {
        await storageService.setDailyGoal(data.dailyGoal);
      }
      
      // Handle goal achievements
      if (data.goalAchievements && Array.isArray(data.goalAchievements)) {
        if (mode === 'replace') {
          await storageService.setGoalAchievements(data.goalAchievements);
        } else {
          // Merge mode: get existing achievements and merge (avoid duplicates by date)
          const existingAchievements = await storageService.getGoalAchievements();
          const existingDates = new Set(existingAchievements.map(a => a.date));
          const newAchievements = data.goalAchievements.filter((a: DailyGoalAchievement) => !existingDates.has(a.date));
          const mergedAchievements = [...existingAchievements, ...newAchievements];
          await storageService.setGoalAchievements(mergedAchievements);
        }
      } else if (mode === 'replace') {
        await storageService.setGoalAchievements([]);
      }
      
      if (process.env.NODE_ENV !== 'test') {
        console.log('Data imported successfully');
      }
      onImportSuccess?.({ 
        mode,
        importedCounts: {
          tasks: data.tasks?.length || 0,
          noteTemplates: data.noteTemplates?.length || 0,
          taskNotes: data.taskNotes?.length || 0,
          goalAchievements: data.goalAchievements?.length || 0,
          sessions: restored.sessionsRestored,
          workLogEntries: restored.workLogEntriesRestored,
        },
        recordsSkipped: restored.recordsSkipped,
      });
      
    } catch (error) {
      // Only log in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('Import failed:', error);
      }
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
