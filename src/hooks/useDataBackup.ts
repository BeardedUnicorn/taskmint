import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StorageService } from '../services/StorageService';
import { Task } from '../types/task';
import { NoteTemplate, TaskNote } from '../types/notes';
import { DailyGoalAchievement } from '../types/goal';
import { TaskSession } from '../types/timer';
import { WorkLogsResponse } from '../types/workLog';
import { BACKUP_FORMAT_VERSION, BackupFileSchema, RestoreSummary } from '../types/backup';
import { safeInvoke, isTauriEnvironment } from '../utils/tauri';

interface UseDataBackupProps {
  onExportSuccess?: () => void;
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

  const createBackupData = async () => {
    const storageService = StorageService.getInstance();
    
    try {
      const [
        timeEntries,
        tasks,
        noteTemplates,
        taskNotes,
        dailyGoal,
        goalAchievements,
        sessions,
        workLogs
      ] = await Promise.all([
        storageService.getTimeEntries(),
        storageService.getTasks(),
        storageService.getNoteTemplates(),
        storageService.getTaskNotes(),
        storageService.getDailyGoal(),
        storageService.getGoalAchievements(),
        // Tracked time and the work-log ledger live in the Rust stores. Use
        // invoke, not safeInvoke: a failed read must fail the backup rather
        // than silently produce a file with no tracked time in it.
        isTauriEnvironment() ? invoke<TaskSession[]>('get_sessions') : Promise.resolve([]),
        isTauriEnvironment() ? invoke<WorkLogsResponse>('get_work_logs') : Promise.resolve(null),
      ]);

      return {
        version: BACKUP_FORMAT_VERSION,
        exportDate: new Date().toISOString(),
        data: {
          timeEntries,
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
  };

  const exportData = async () => {
    if (isExporting) return;

    setIsExporting(true);

    try {
      if (!isTauriEnvironment()) {
        throw new Error('Export functionality is only available in the desktop app');
      }

      // Create the backup data
      const backupData = await createBackupData();
      const dataJson = JSON.stringify(backupData, null, 2);

      // Generate suggested filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const suggestedFilename = `taskmint_export_${timestamp}.json`;

      // Call Tauri command to show save dialog and export
      const exportPath = await safeInvoke<string>('export_data_to_file', {
        dataJson,
        suggestedFilename
      });

      if (!exportPath) {
        throw new Error('Export was cancelled or failed');
      }

      if (process.env.NODE_ENV !== 'test') {
        console.log('Data exported successfully to:', exportPath);
      }
      onExportSuccess?.();

    } catch (error) {
      // Only log in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('Export failed:', error);
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data';
      onExportError?.(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const importData = async (mode: 'merge' | 'replace' = 'merge') => {
    if (isImporting) return;

    setIsImporting(true);

    try {
      if (!isTauriEnvironment()) {
        throw new Error('Import functionality is only available in the desktop app');
      }

      // Call Tauri command to show open dialog and get file contents
      const fileContents = await safeInvoke<string>('import_data_from_file');

      if (!fileContents) {
        throw new Error('Import was cancelled or failed');
      }
      
      const parsed = BackupFileSchema.safeParse(JSON.parse(fileContents));
      if (!parsed.success) {
        throw new Error('Invalid backup file format: this is not a TaskMint export');
      }
      const { data, exportDate } = parsed.data;

      // Sessions and work logs first: the Rust restore writes safety copies
      // of both stores before changing them. A section the file lacks (v1
      // exports have no work logs) is sent as null and left untouched.
      const restored = await invoke<RestoreSummary>('restore_backup_data', {
        payload: {
          mode,
          sessions: data.sessions ?? null,
          workLogEntries: data.workLogs?.entries ?? null,
          workLogMappings: data.workLogs?.mappings ?? null,
          exportedAt: exportDate ?? null,
        },
      });

      const storageService = StorageService.getInstance();
      
      // Handle time entries
      if (data.timeEntries && Array.isArray(data.timeEntries)) {
        if (mode === 'replace') {
          await storageService.setTimeEntries(data.timeEntries);
        } else {
          // Merge mode: get existing entries and merge
          const existingEntries = await storageService.getTimeEntries();
          const mergedEntries = [...existingEntries, ...data.timeEntries];
          await storageService.setTimeEntries(mergedEntries);
        }
      } else if (mode === 'replace') {
        await storageService.setTimeEntries([]);
      }
      
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
          timeEntries: data.timeEntries?.length || 0,
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
      let errorMessage = 'Failed to import data';
      
      if (error instanceof Error) {
        if (error.message.includes('cancelled by user')) {
          errorMessage = 'Import cancelled';
        } else if (error.message.includes('Invalid JSON')) {
          errorMessage = 'Invalid file format. Please select a valid TaskMint export file.';
        } else {
          errorMessage = error.message;
        }
      }
      
      onImportError?.(errorMessage);
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
