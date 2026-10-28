/**
 * Navigates the page to `url`. For a taskmint:// link, Chrome asks to open
 * TaskMint, and the page never unloads (an external scheme). Its own module
 * so tests can stand in for it: jsdom can't navigate.
 */
export function navigate(url: string): void {
  window.location.href = url;
}
