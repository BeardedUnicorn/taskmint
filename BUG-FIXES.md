## List of Identified Bugs and Tasks for Remediation

### Task 1: Implement Missing Actions in Task Detail View

*   **File:** `src/components/pages/tasks/TaskDetailPane.tsx`
*   **Bug Description:** The "Edit" and "Delete" buttons for each time entry listed on the task detail page are currently non-functional. Their `onClick` handlers are empty `TODO` stubs, preventing users from managing time entries directly from this view.
*   **Task for AI:**
    1.  Modify the `TaskDetailPane` component to accept `onEditEntry: (entry: TimeEntry) => void` and `onDeleteEntry: (entryId: string) => void` as props.
    2.  Update the `TasksPage` component (`src/components/pages/TasksPage.tsx`) to pass down the necessary handlers to `TaskDetailPane`. These handlers should be responsible for opening the edit dialog and the delete confirmation dialog, respectively.
    3.  Wire the `onClick` events of the `EditIcon` and `DeleteIcon` `IconButton`s in `TaskDetailPane` to call these new props with the appropriate time entry object or ID. The implementation should be similar to the one in `TodaysEntriesList.tsx`.

### Task 2: Enable Edit Functionality on the Reports Page

*   **File:** `src/components/pages/ReportsPage.tsx`
*   **Bug Description:** On the Reports page, the table of time entries includes an "Edit" button for each row, but it is not wired to any functionality. The `onClick` handler is an empty `TODO` stub.
*   **Task for AI:**
    1.  Implement the edit functionality for time entries on the `ReportsPage`. This will require adding state to manage which entry is being edited and to control the visibility of the `EditTimeEntryDialog`.
    2.  The `ReportsPage` component needs to accept an `onUpdateEntry` prop.
    3.  Update `App.tsx` to pass the `handleUpdateEntryWithFeedback` function as a prop to the `ReportsPage`.
    4.  When the "Edit" button is clicked, display the `EditTimeEntryDialog` pre-filled with the data from the selected time entry. On save, the `onUpdateEntry` prop should be called.

### Task 3: Ensure Cascading Deletion of Time Entries When a Task is Deleted

*   **File:** `src/services/TaskService.ts`
*   **Bug Description:** The `deleteTask` method in the `TaskService` removes a task from storage but does not remove the time entries associated with that task. This orphans the time entries, leading to data inconsistency. The confirmation dialog in the UI correctly implies that associated entries will be removed, but the backend logic is missing.
*   **Task for AI:**
    1.  Modify the `deleteTask` method in `src/services/TaskService.ts`.
    2.  Before deleting the task, the method must first retrieve all time entries from the `StorageService`.
    3.  Filter these entries to find all that are associated with the `taskId` being deleted.
    4.  Create a new array of time entries that excludes the ones to be deleted.
    5.  Use `storageService.setTimeEntries()` to save the filtered array back to storage.
    6.  Proceed with deleting the task as before. Ensure both operations (deleting entries and deleting the task) are handled gracefully.

### Task 4: Implement the "Import Data" Feature

*   **Files:** `src/components/pages/SettingsPage.tsx`, `src/hooks/useDataBackup.ts`
*   **Bug Description:** The "Import Data" functionality is marked as "Coming Soon" and is disabled. The corresponding `onClick` handler is a placeholder.
*   **Task for AI:**
    1.  Enable the "Import Data" button in `SettingsPage.tsx`.
    2.  In `useDataBackup.ts`, create a new `importData` async function.
    3.  This function should use a file input or a Tauri dialog API to prompt the user to select a JSON backup file.
    4.  Read the content of the selected file.
    5.  Parse the JSON string and validate its structure against the `BackupData` interface defined in the hook.
    6.  Implement logic to handle the imported data. A good approach would be to show a confirmation dialog asking the user if they want to **Merge** the imported data with existing data or **Replace** all existing data.
    7.  Based on the user's choice, update the `timeEntries` and `tasks` in local storage via the `useLocalStorage` hook.
    8.  Provide user feedback on success or failure using the `useNotification` hook.

### Task 5: Restore and Synchronize Active Timer State on App Startup

*   **Files:** `src/App.tsx`, `src-tauri/src/lib.rs`
*   **Bug Description:** When the application is closed and reopened, if a timer was running, it is correctly identified from local storage. However, its state (especially the elapsed time) is not synchronized back to the Tauri backend. This results in the system tray icon not showing the correct running timer status until a new action is performed in the UI.
*   **Task for AI:**
    1.  In `App.tsx`, locate the `useEffect` hook where time entries are loaded from `timerService`.
    2.  Inside the `if (runningEntry)` block, after `setActiveEntry(runningEntry)`, add a call to the `invoke` function from `@tauri-apps/api/core`.
    3.  This `invoke` call should target the `update_timer_state` command, passing the full state of the restored running timer. This includes `isRunning: true`, the `taskName`, the `startTime` (as an ISO string), and the correctly calculated `elapsedMs` (`Date.now() - new Date(runningEntry.startTime).getTime()`).
    4.  This will ensure that the backend and system tray are immediately aware of the active timer as soon as the app launches and loads its state.
