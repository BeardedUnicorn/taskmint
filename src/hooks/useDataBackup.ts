import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StorageService } from '../services/StorageService';

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
        goalAchievements
      ] = await Promise.all([
        storageService.getTimeEntries(),
        storageService.getTasks(),
        storageService.getNoteTemplates(),
        storageService.getTaskNotes(),
        storageService.getDailyGoal(),
        storageService.getGoalAchievements()
      ]);

      return {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {
          timeEntries,
          tasks,
          noteTemplates,
          taskNotes,
          dailyGoal,
          goalAchievements
        }
      };
    } catch (error) {
      console.error('Failed to create backup data:', error);
      throw new Error('Failed to gather data for export');
    }
  };

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
      
      // Call Tauri command to show save dialog and export
      const exportPath = await invoke<string>('export_data_to_file', {
        dataJson,
        suggestedFilename
      });
      
      console.log('Data exported successfully to:', exportPath);
      onExportSuccess?.();
      
    } catch (error) {
      console.error('Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data';
      onExportError?.(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const importData = async (mode: string) => {
    if (isImporting) return;
    
    setIsImporting(true);
    
    try {
      // TODO: Implement import functionality
      // For now, just simulate success
      console.log(`Import mode: ${mode}`);
      onImportSuccess?.({});
    } catch (error) {
      console.error('Import failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to import data';
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
