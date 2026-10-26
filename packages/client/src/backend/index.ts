export type {
  Backend,
  Capabilities,
  FilePlatform,
  FolderBackupPlatform,
  IdlePlatform,
  NotificationPlatform,
  Platform,
  SavedFile,
} from './types';
export { getBackend, setBackend } from './registry';
export { useBackendEvent } from './useBackendEvent';
