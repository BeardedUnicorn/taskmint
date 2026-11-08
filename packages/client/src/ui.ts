/**
 * The client's building blocks a shell's own screens use
 * (`@taskmint/client/ui`): the app's theme, Settings' section frame, the
 * confirmation dialog, toasts, and the wordmark.
 */

export { ThemeProvider as AppThemeProvider } from './contexts/ThemeContext';
export { SettingsSection } from './components/pages/settings/SettingsSection';
export { ConfirmDialog } from './components/ui/dialogs/ConfirmDialog';
export { useNotification } from './contexts/NotificationContext';
export { Wordmark } from './components/ui/display/Wordmark';
