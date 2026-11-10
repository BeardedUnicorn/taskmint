export type {
  AnalyticsPlatform,
  Backend,
  Capabilities,
  CommandArgsParam,
  FolderBackupPlatform,
  Platform,
  SavedFile,
} from './types';
export { getBackend, setBackend } from './registry';
export { useBackendEvent } from './useBackendEvent';
