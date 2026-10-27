import { APP_RECORD_KEYS } from '../services/appRecords';
import { useNotification } from '../contexts/NotificationContext';
import { useAppRecordsChanged } from './useAppRecordsChanged';

export const RECORD_CONFLICT_NOTICE =
  "This was changed on another device, so your last change wasn't saved. You're seeing the latest version now.";

/** Says so when a save was refused because the record changed elsewhere. */
export function useRecordConflictNotice(): void {
  const { showWarning } = useNotification();
  useAppRecordsChanged(APP_RECORD_KEYS, change => {
    if (change.conflict) showWarning(RECORD_CONFLICT_NOTICE);
  });
}
