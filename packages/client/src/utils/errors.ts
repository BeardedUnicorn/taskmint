/**
 * The message to show for a caught failure. Backend commands reject with plain
 * strings, services throw Errors, and some code throws `{ message }` objects;
 * anything else (or an empty message) falls back to `fallback`.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message.trim() || fallback;
  if (typeof err === 'string') return err.trim() || fallback;
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
