/**
 * Data Backup and Export Hook
 * 
 * This hook provides functionality for backing up and exporting user data
 * including time entries and tasks with JSON export capabilities.
 */

import { useCallback, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useAsyncError } from './useAsyncError';
import { STORAGE_KEYS } from '../constants';
import { TimeEntry } from '../types/timer';
import { Task } from '../types/task';
import { NoteTemplate, TaskNote } from '../types/notes';


// Backup data structure
export interface BackupData {
  version: string;
  exportedAt: string;
  exportedBy: string;
  data: {
    timeEntries: TimeEntry[];
    tasks: Task[];
    noteTemplates: NoteTemplate[];
    taskNotes: TaskNote[];
  };
  metadata: {
    totalTimeEntries: number;
    totalTasks: number;
    totalNoteTemplates: number;
    totalTaskNotes: number;
    dateRange?: {
      earliest: string;
      latest: string;
    };
  };
}

// Import result interface
export interface ImportResult {
  success: boolean;
  message: string;
  imported: {
    timeEntries: number;
    tasks: number;
    noteTemplates: number;
    taskNotes: number;
  };
  errors?: string[];
}

// Hook options
export interface UseDataBackupOptions {
  onExportSuccess?: (filename: string) => void;
  onExportError?: (error: string) => void;
  onImportSuccess?: (result: ImportResult) => void;
  onImportError?: (error: string) => void;
}

/**
 * Hook for managing data backup and export functionality
 */
export function useDataBackup(options: UseDataBackupOptions = {}) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const { executeAsync } = useAsyncError();
  
  // Get data from localStorage
  const [timeEntries, setTimeEntries] = useLocalStorage<TimeEntry[]>(STORAGE_KEYS.TIME_ENTRIES, []);
  const [tasks, setTasks] = useLocalStorage<Task[]>(STORAGE_KEYS.PREDEFINED_TASKS, []);
  const [noteTemplates, setNoteTemplates] = useLocalStorage<NoteTemplate[]>(STORAGE_KEYS.NOTE_TEMPLATES, []);
  const [taskNotes, setTaskNotes] = useLocalStorage<TaskNote[]>(STORAGE_KEYS.TASK_NOTES, []);


  // Calculate date range for metadata
  const calculateDateRange = useCallback((entries: TimeEntry[]) => {
    if (entries.length === 0) return undefined;

    const dates = entries
      .map(entry => entry.date)
      .filter(date => date)
      .sort();

    return {
      earliest: dates[0],
      latest: dates[dates.length - 1],
    };
  }, []);

  // Create backup data structure
  const createBackupData = useCallback((): BackupData => {
    const dateRange = calculateDateRange(timeEntries);

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: 'Time Tracker App',
      data: {
        timeEntries,
        tasks,
        noteTemplates,
        taskNotes,
      },
      metadata: {
        totalTimeEntries: timeEntries.length,
        totalTasks: tasks.length,
        totalNoteTemplates: noteTemplates.length,
        totalTaskNotes: taskNotes.length,
        dateRange,
      },
    };
  }, [timeEntries, tasks, noteTemplates, taskNotes, calculateDateRange]);

  // Export data as JSON file
  const exportData = useCallback(async (filename?: string) => {
    return executeAsync(
      async () => {
        setIsExporting(true);

        const backupData = createBackupData();
        const jsonString = JSON.stringify(backupData, null, 2);
        
        // Create blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const defaultFilename = `time-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
        const finalFilename = filename || defaultFilename;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        if (options.onExportSuccess) {
          options.onExportSuccess(finalFilename);
        }
        
        return finalFilename;
      },
      {
        operation: 'export-data',
        errorHandler: (error) => {
          if (options.onExportError) {
            options.onExportError(error.message);
          }
        },
      }
    ).finally(() => {
      setIsExporting(false);
    });
  }, [createBackupData, executeAsync, options]);

  // Export specific data type
  const exportTimeEntries = useCallback(async (filename?: string) => {
    return executeAsync(
      async () => {
        setIsExporting(true);

        const exportData = {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          type: 'time-entries',
          data: timeEntries,
          metadata: {
            totalEntries: timeEntries.length,
            dateRange: calculateDateRange(timeEntries),
          },
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const defaultFilename = `time-entries-${new Date().toISOString().split('T')[0]}.json`;
        const finalFilename = filename || defaultFilename;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        return finalFilename;
      },
      {
        operation: 'export-time-entries',
        errorHandler: (error) => {
          if (options.onExportError) {
            options.onExportError(error.message);
          }
        },
      }
    ).finally(() => {
      setIsExporting(false);
    });
  }, [timeEntries, calculateDateRange, executeAsync, options]);

  // Export tasks
  const exportTasks = useCallback(async (filename?: string) => {
    return executeAsync(
      async () => {
        setIsExporting(true);

        const exportData = {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          type: 'tasks',
          data: tasks,
          metadata: {
            totalTasks: tasks.length,
          },
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const defaultFilename = `tasks-${new Date().toISOString().split('T')[0]}.json`;
        const finalFilename = filename || defaultFilename;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        return finalFilename;
      },
      {
        operation: 'export-tasks',
        errorHandler: (error) => {
          if (options.onExportError) {
            options.onExportError(error.message);
          }
        },
      }
    ).finally(() => {
      setIsExporting(false);
    });
  }, [tasks, executeAsync, options]);

  // Validate backup data structure
  const validateBackupData = (data: any): data is BackupData => {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.version === 'string' &&
      typeof data.exportedAt === 'string' &&
      data.data &&
      Array.isArray(data.data.timeEntries) &&
      Array.isArray(data.data.tasks) &&
      Array.isArray(data.data.noteTemplates || []) &&
      Array.isArray(data.data.taskNotes || []) &&
      data.metadata &&
      typeof data.metadata.totalTimeEntries === 'number' &&
      typeof data.metadata.totalTasks === 'number'
    );
  };

  // Import data from JSON file
  const importData = useCallback(async (mergeMode: 'merge' | 'replace' = 'merge') => {
    return executeAsync(
      async () => {
        setIsImporting(true);

        // Create file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';

        return new Promise<string>((resolve, reject) => {
          input.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) {
              reject(new Error('No file selected'));
              return;
            }

            try {
              const text = await file.text();
              const importedData = JSON.parse(text);

              // Validate the imported data
              if (!validateBackupData(importedData)) {
                throw new Error('Invalid backup file format. Please select a valid Time Tracker backup file.');
              }

              // Process the imported data based on merge mode
              if (mergeMode === 'replace') {
                // Replace all existing data
                setTimeEntries(importedData.data.timeEntries);
                setTasks(importedData.data.tasks);
                setNoteTemplates(importedData.data.noteTemplates || []);
                setTaskNotes(importedData.data.taskNotes || []);
              } else {
                // Merge with existing data
                const existingEntryIds = new Set(timeEntries.map(entry => entry.id));
                const existingTaskIds = new Set(tasks.map(task => task.id));
                const existingTemplateIds = new Set(noteTemplates.map(template => template.id));
                const existingNoteIds = new Set(taskNotes.map(note => note.id));

                // Filter out duplicates and merge
                const newTimeEntries = importedData.data.timeEntries.filter(
                  (entry: TimeEntry) => !existingEntryIds.has(entry.id)
                );
                const newTasks = importedData.data.tasks.filter(
                  (task: Task) => !existingTaskIds.has(task.id)
                );
                const newNoteTemplates = (importedData.data.noteTemplates || []).filter(
                  (template: NoteTemplate) => !existingTemplateIds.has(template.id)
                );
                const newTaskNotes = (importedData.data.taskNotes || []).filter(
                  (note: TaskNote) => !existingNoteIds.has(note.id)
                );

                setTimeEntries([...timeEntries, ...newTimeEntries]);
                setTasks([...tasks, ...newTasks]);
                setNoteTemplates([...noteTemplates, ...newNoteTemplates]);
                setTaskNotes([...taskNotes, ...newTaskNotes]);
              }

              const importResult: ImportResult = {
                success: true,
                message: mergeMode === 'replace'
                  ? `Data replaced successfully. Imported ${importedData.metadata.totalTimeEntries} time entries, ${importedData.metadata.totalTasks} tasks, ${importedData.metadata.totalNoteTemplates || 0} note templates, and ${importedData.metadata.totalTaskNotes || 0} task notes.`
                  : `Data merged successfully. Added ${importedData.data.timeEntries.length} time entries, ${importedData.data.tasks.length} tasks, ${(importedData.data.noteTemplates || []).length} note templates, and ${(importedData.data.taskNotes || []).length} task notes.`,
                imported: {
                  timeEntries: mergeMode === 'replace' ? importedData.metadata.totalTimeEntries : importedData.data.timeEntries.length,
                  tasks: mergeMode === 'replace' ? importedData.metadata.totalTasks : importedData.data.tasks.length,
                  noteTemplates: mergeMode === 'replace' ? (importedData.metadata.totalNoteTemplates || 0) : (importedData.data.noteTemplates || []).length,
                  taskNotes: mergeMode === 'replace' ? (importedData.metadata.totalTaskNotes || 0) : (importedData.data.taskNotes || []).length,
                }
              };

              if (options.onImportSuccess) {
                options.onImportSuccess(importResult);
              }

              resolve(importResult.message);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to import data';
              if (options.onImportError) {
                options.onImportError(errorMessage);
              }
              reject(new Error(errorMessage));
            } finally {
              document.body.removeChild(input);
            }
          };

          input.oncancel = () => {
            document.body.removeChild(input);
            reject(new Error('Import cancelled'));
          };

          document.body.appendChild(input);
          input.click();
        });
      },
      {
        operation: 'import-data',
        errorHandler: (error) => {
          if (options.onImportError) {
            options.onImportError(error.message);
          }
        },
      }
    ).finally(() => {
      setIsImporting(false);
    });
  }, [timeEntries, tasks, noteTemplates, taskNotes, setTimeEntries, setTasks, setNoteTemplates, setTaskNotes, executeAsync, options]);

  // Get backup summary
  const getBackupSummary = useCallback(() => {
    const dateRange = calculateDateRange(timeEntries);

    return {
      totalTimeEntries: timeEntries.length,
      totalTasks: tasks.length,
      totalNoteTemplates: noteTemplates.length,
      totalTaskNotes: taskNotes.length,
      dateRange,
      lastModified: new Date().toISOString(),
    };
  }, [timeEntries, tasks, noteTemplates, taskNotes, calculateDateRange]);

  return {
    // State
    isExporting,
    isImporting,

    // Export functions
    exportData,
    exportTimeEntries,
    exportTasks,

    // Import functions
    importData,

    // Utility functions
    createBackupData,
    getBackupSummary,
  };
}
