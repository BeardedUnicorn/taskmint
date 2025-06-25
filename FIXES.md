# TaskMint Settings Screen & Related Functionality - Fixes & Augmentation Checklist

## High Priority / Bugs

- [x] **Data Import**: Enhance `useDataBackup`'s `importData` function to perform deep validation of imported `timeEntries`, `tasks`, `noteTemplates`, and `taskNotes` using their respective Zod schemas.
- [x] **Error Handling**: Review `StorageService.getItem` logic. If a key is not found in localStorage, ensure it directly returns `defaultValue` without attempting migration on `null`, unless `null` is a valid state that *should* be migrated.

## Medium Priority / Improvements

- [x] **Daily Goals**: In `SettingsPage.tsx` -> `handleSaveGoal`, ensure `isEnabled` reflects the Switch's current state accurately or refactor `updateDailyGoal` to not manage `isEnabled` if `enableDailyGoal` is its sole controller.
- [x] **Tauri Error Propagation**: For `invoke` calls in `useBackupSettings`, `useCloudSync`, and `useSystemTray`, ensure specific error messages from the Rust backend (e.g., `BackupResult.error`) are propagated to user notifications via `useNotification`, not just generic failure messages.
- [x] **Backup Path Validation**: In `useBackupSettings` (and/or the Rust backend for `perform_automatic_backup`), add validation to confirm the `backupPath` is a valid and writable directory before initiating a backup.
- [x] **Rust Backup Cleanup**: Ensure the Rust `cleanup_old_backups` function is robust in parsing filenames and timestamps for reliable cleanup, especially across different OS locales (current `YYYYMMDD_HHMMSS` format is good, but confirm parsing logic).

## Low Priority / Refinements

- [x] **Dashboard Settings Migration**: Evaluate if the `migrationDone.current` ref in `useDashboardSettings` is robust enough or if a more global migration flag is needed for the widget migration logic (likely fine for current single-page use).
- [x] **Environment Variables**: Standardize access to environment variables (like `VITE_GOOGLE_CLIENT_ID` accessed via `getEnvVar` in `useCloudSync.ts`) if used in multiple places, ensuring consistent handling for Vite and test environments.

## Testing Tasks

### Hook Unit Tests
- [x] **`useTimerSettings.ts`**: Test storage and retrieval of rounding options.
- [x] **`useDashboardSettings.ts`**: Test widget toggling, order updates (if applicable), reset, and widget migration logic.
- [x] **`useBackupSettings.ts`**: Mock Tauri `invoke` and `dialog`. Test enable/disable, config updates, manual backup (success/failure), directory selection.
- [x] **`useCloudSync.ts`**: Mock Tauri `invoke` for `google_drive_*` commands. Test auth URL, authentication (success/failure), token refresh (if applicable), sync operations (upload, download, conflict scenarios), disconnect.
- [x] **`useDailyGoals.ts`**: Test goal CRUD, enable/disable, achievement recording, and retrieval.
- [x] **`useNoteTemplates.ts`**: Mock `NoteTemplateService`. Test CRUD, duplicate, toggle active, get active, stats, search, sort, refresh.
- [x] **`useTaskNotes.ts`**: Mock `TaskNotesService`. Test all its exposed functions similar to `useNoteTemplates`.
- [x] **`useSystemTray.ts`**: Mock Tauri `invoke` and `listen`. Test event handling and backend state updates.
- [x] **`useErrorRecovery.ts`**: Test retry logic, backoff, max retries, and callback invocations.
- [x] **`useValidatedLocalStorage.ts`**: Test with various data types, schema validation (pass/fail), guard validation, migration paths, backup on set/clear.
- [x] **Review `useTaskManagement.test.ts`**: Ensure complete coverage, especially for hierarchical logic and deletion strategies.
- [x] **Review `useDataBackup.test.ts`**: Ensure complete coverage, especially for specific export types and error handling.

### Service Unit Tests
- [x] **`StorageService.ts`**: Critical tests for `getItem`/`setItem` with/without schema, migration paths, and error handling scenarios.
- [x] **`NoteTemplateService.ts`**: Test CRUD, duplicate, active filtering, stats, and name uniqueness.
- [x] **`TaskNotesService.ts`**: Test CRUD, filtering by task/time entry, and validation against templates.
- [x] **`TaskService.ts`**: Test CRUD, hierarchical logic (build, get children/parent/path), deletion strategies, and validation.
- [x] **`TimerService.ts`**: Test start/stop, rounding logic, and Tauri interactions.

### Util Unit Tests
- [x] **`earningsCalculator.ts`**: Test calculations for various scenarios (date, range, breakdown).
- [x] **`chartDataHelpers.ts`**: Test all aggregation functions (byTask, byDay, byWeek, byMonth) and data preparation.
- [x] **`sanitization.ts`**: Test all sanitization functions with various inputs.
- [x] **`performance.ts`**: Test metric recording, reporting, and utility functions.

### Component Tests (Settings Page)
- [x] **`SettingsPage.tsx`**: Write integration-style tests, mocking its custom hooks to verify UI interactions, state changes, and that appropriate hook functions are called.
- [x] **Refactor & Test Sub-components**: Consider refactoring large sections of `SettingsPage.tsx` (e.g., DailyGoalSettings, BackupSettingsSection, CloudSyncSettingsSection) into their own components and write focused unit/integration tests for them.
