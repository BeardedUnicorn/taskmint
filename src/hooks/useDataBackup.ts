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


// Backup data structure
export interface BackupData {
  version: string;
  exportedAt: string;
  exportedBy: string;
  data: {
    timeEntries: TimeEntry[];
    tasks: Task[];
  };
  metadata: {
    totalTimeEntries: number;
    totalTasks: number;
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
  const [isImporting] = useState(false); // setIsImporting removed as it's not used
  
  const { executeAsync } = useAsyncError();
  
  // Get data from localStorage
  const [timeEntries] = useLocalStorage<TimeEntry[]>(STORAGE_KEYS.TIME_ENTRIES, []);
  const [tasks] = useLocalStorage<Task[]>(STORAGE_KEYS.PREDEFINED_TASKS, []);


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
      },
      metadata: {
        totalTimeEntries: timeEntries.length,
        totalTasks: tasks.length,
        dateRange,
      },
    };
  }, [timeEntries, tasks, calculateDateRange]);

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



  // Get backup summary
  const getBackupSummary = useCallback(() => {
    const dateRange = calculateDateRange(timeEntries);
    
    return {
      totalTimeEntries: timeEntries.length,
      totalTasks: tasks.length,
      dateRange,
      lastModified: new Date().toISOString(),
    };
  }, [timeEntries, tasks, calculateDateRange]);

  return {
    // State
    isExporting,
    isImporting,
    
    // Export functions
    exportData,
    exportTimeEntries,
    exportTasks,
    
    // Utility functions
    createBackupData,
    getBackupSummary,
  };
}
