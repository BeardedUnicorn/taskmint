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
import { TimeEntry, TimeEntrySchema } from '../types/timer';
import { Task, TaskSchema } from '../types/task';
import { NoteTemplate, TaskNote, NoteTemplateSchema, TaskNoteSchema } from '../types/notes';


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
  validationErrors?: {
    timeEntries: string[];
    tasks: string[];
    noteTemplates: string[];
    taskNotes: string[];
  };
  skipped?: {
    timeEntries: number;
    tasks: number;
    noteTemplates: number;
    taskNotes: number;
  };
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
      exportedBy: 'TaskMint',
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

  // Deep validation helper function
  const validateImportedData = (data: BackupData) => {
    const validationErrors = {
      timeEntries: [] as string[],
      tasks: [] as string[],
      noteTemplates: [] as string[],
      taskNotes: [] as string[]
    };

    const validData = {
      timeEntries: [] as TimeEntry[],
      tasks: [] as Task[],
      noteTemplates: [] as NoteTemplate[],
      taskNotes: [] as TaskNote[]
    };

    const skipped = {
      timeEntries: 0,
      tasks: 0,
      noteTemplates: 0,
      taskNotes: 0
    };

    // Validate time entries
    data.data.timeEntries.forEach((entry, index) => {
      try {
        const validatedEntry = TimeEntrySchema.parse(entry);
        validData.timeEntries.push(validatedEntry);
      } catch (error) {
        skipped.timeEntries++;
        validationErrors.timeEntries.push(`Time entry ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
      }
    });

    // Validate tasks
    data.data.tasks.forEach((task, index) => {
      try {
        const validatedTask = TaskSchema.parse(task);
        validData.tasks.push(validatedTask);
      } catch (error) {
        skipped.tasks++;
        validationErrors.tasks.push(`Task ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
      }
    });

    // Validate note templates
    (data.data.noteTemplates || []).forEach((template, index) => {
      try {
        const validatedTemplate = NoteTemplateSchema.parse(template);
        validData.noteTemplates.push(validatedTemplate);
      } catch (error) {
        skipped.noteTemplates++;
        validationErrors.noteTemplates.push(`Note template ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
      }
    });

    // Validate task notes
    (data.data.taskNotes || []).forEach((note, index) => {
      try {
        const validatedNote = TaskNoteSchema.parse(note);
        validData.taskNotes.push(validatedNote);
      } catch (error) {
        skipped.taskNotes++;
        validationErrors.taskNotes.push(`Task note ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
      }
    });

    return { validData, validationErrors, skipped };
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

              // Validate the imported data structure
              if (!validateBackupData(importedData)) {
                throw new Error('Invalid backup file format. Please select a valid TaskMint backup file.');
              }

              // Perform deep validation of imported data
              const { validData, validationErrors, skipped } = validateImportedData(importedData);

              // Check if we have any valid data to import
              const totalValidItems = validData.timeEntries.length + validData.tasks.length +
                validData.noteTemplates.length + validData.taskNotes.length;

              if (totalValidItems === 0) {
                throw new Error('No valid data found in the backup file. All items failed validation.');
              }

              // Process the validated data based on merge mode
              if (mergeMode === 'replace') {
                // Replace all existing data with validated data
                setTimeEntries(validData.timeEntries);
                setTasks(validData.tasks);
                setNoteTemplates(validData.noteTemplates);
                setTaskNotes(validData.taskNotes);
              } else {
                // Merge with existing data, filtering out duplicates
                const existingEntryIds = new Set(timeEntries.map(entry => entry.id));
                const existingTaskIds = new Set(tasks.map(task => task.id));
                const existingTemplateIds = new Set(noteTemplates.map(template => template.id));
                const existingNoteIds = new Set(taskNotes.map(note => note.id));

                // Filter out duplicates from validated data
                const newTimeEntries = validData.timeEntries.filter(
                  (entry: TimeEntry) => !existingEntryIds.has(entry.id)
                );
                const newTasks = validData.tasks.filter(
                  (task: Task) => !existingTaskIds.has(task.id)
                );
                const newNoteTemplates = validData.noteTemplates.filter(
                  (template: NoteTemplate) => !existingTemplateIds.has(template.id)
                );
                const newTaskNotes = validData.taskNotes.filter(
                  (note: TaskNote) => !existingNoteIds.has(note.id)
                );

                setTimeEntries([...timeEntries, ...newTimeEntries]);
                setTasks([...tasks, ...newTasks]);
                setNoteTemplates([...noteTemplates, ...newNoteTemplates]);
                setTaskNotes([...taskNotes, ...newTaskNotes]);
              }

              // Calculate actual imported counts (for merge mode, exclude duplicates)
              const actualImported = mergeMode === 'replace'
                ? {
                  timeEntries: validData.timeEntries.length,
                  tasks: validData.tasks.length,
                  noteTemplates: validData.noteTemplates.length,
                  taskNotes: validData.taskNotes.length,
                }
                : {
                  timeEntries: validData.timeEntries.filter(entry => !timeEntries.some(e => e.id === entry.id)).length,
                  tasks: validData.tasks.filter(task => !tasks.some(t => t.id === task.id)).length,
                  noteTemplates: validData.noteTemplates.filter(template => !noteTemplates.some(t => t.id === template.id)).length,
                  taskNotes: validData.taskNotes.filter(note => !taskNotes.some(n => n.id === note.id)).length,
                };

              // Create detailed message including validation results
              const hasValidationErrors = Object.values(validationErrors).some(errors => errors.length > 0);
              const hasSkippedItems = Object.values(skipped).some(count => count > 0);

              let message = mergeMode === 'replace'
                ? `Data replaced successfully. Imported ${actualImported.timeEntries} time entries, ${actualImported.tasks} tasks, ${actualImported.noteTemplates} note templates, and ${actualImported.taskNotes} task notes.`
                : `Data merged successfully. Added ${actualImported.timeEntries} time entries, ${actualImported.tasks} tasks, ${actualImported.noteTemplates} note templates, and ${actualImported.taskNotes} task notes.`;

              if (hasSkippedItems) {
                message += ` Skipped ${skipped.timeEntries} invalid time entries, ${skipped.tasks} invalid tasks, ${skipped.noteTemplates} invalid note templates, and ${skipped.taskNotes} invalid task notes.`;
              }

              const importResult: ImportResult = {
                success: true,
                message,
                imported: actualImported,
                validationErrors: hasValidationErrors ? validationErrors : undefined,
                skipped: hasSkippedItems ? skipped : undefined,
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
  }, [timeEntries, tasks, noteTemplates, taskNotes, setTimeEntries, setTasks, setNoteTemplates, setTaskNotes, executeAsync, options, validateBackupData, validateImportedData]);

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
