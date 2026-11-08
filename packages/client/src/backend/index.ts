export type {
  Backend,
  Capabilities,
  CommandArgsParam,
  FilePlatform,
  FolderBackupPlatform,
  IdlePlatform,
  NotificationPlatform,
  Platform,
  TrayPlatform,
  SavedFile,
} from './types';
export { getBackend, setBackend } from './registry';
export { useBackendEvent } from './useBackendEvent';
