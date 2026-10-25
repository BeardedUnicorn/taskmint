/**
 * Full-page reload after destructive operations (e.g. the settings-page
 * app-data reset): every provider re-initializes from the now-empty stores.
 * Kept in its own module because jsdom's window.location is unforgeable, so
 * tests mock this module instead of the navigation call itself.
 */
export function reloadApp(): void {
  window.location.reload();
}
