export type {
  AnalyticsPlatform,
  AppShortcut,
  Backend,
  Capabilities,
  CommandArgsParam,
  FolderBackupPlatform,
  LaterNotification,
  NotificationPlatform,
  Platform,
  SavedFile,
  WidgetSnapshot,
} from './types';
export { getBackend, setBackend } from './registry';
export { useBackendEvent } from './useBackendEvent';
