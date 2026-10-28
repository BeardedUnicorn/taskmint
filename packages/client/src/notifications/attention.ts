/**
 * Whether you're looking at TaskMint: its window has focus and isn't hidden
 * (closing it hides it to the tray). Decides toast vs OS notification, and
 * pauses toast timers while you're away so they're still there when you're
 * back.
 */

export function isWindowAttended(): boolean {
  return document.visibilityState !== 'hidden' && document.hasFocus();
}

/** Calls `onChange` whenever focus or visibility changes; returns an unsubscribe. */
export function subscribeAttention(onChange: () => void): () => void {
  window.addEventListener('focus', onChange);
  window.addEventListener('blur', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    window.removeEventListener('blur', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}
