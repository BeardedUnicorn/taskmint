export const useDataBackup = ({ onExportSuccess, onImportSuccess }: {
  onExportSuccess?: () => void;
  onExportError?: (error: string) => void;
  onImportSuccess?: (result: any) => void;
  onImportError?: (error: string) => void;
}) => {
  return {
    exportData: () => {
      // Simulate success for now
      onExportSuccess?.();
    },
    importData: (_mode: string) => {
      // Simulate success for now
      onImportSuccess?.({});
    },
    isExporting: false,
    isImporting: false,
    createBackupData: () => ({}),
  };
};
