/**
 * The toasts on screen and waiting, with their timers. Framework-free (React
 * reads it through useSyncExternalStore), so the stacking rules are testable
 * on their own:
 *
 * - At most MAX_VISIBLE toasts show. A new one replaces the oldest that isn't
 *   an error or a sticky toast; when every visible toast is one of those, it
 *   waits in a queue. Errors are never dropped.
 * - A toast with the same key as one showing (or waiting) merges into it: the
 *   message updates, a count goes up, and its time restarts.
 * - Each toast's time runs down only while nothing holds it: the pointer or
 *   keyboard focus on it, or you being away from the window.
 */

import type { NotificationAction, NotificationCategory, Severity } from './types';

export const MAX_VISIBLE = 3;
/** Waiting non-error toasts kept; older ones are dropped (they stay in the history). */
export const MAX_QUEUED = 5;
/** A paused toast gets at least this long once it's free to go. */
export const MIN_RESUME_MS = 2000;
/** How long a dismissed toast takes to animate out before it's removed. */
export const EXIT_MS = 250;

const DEFAULT_DURATION: Record<Severity, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 10000,
};
/** Toasts with buttons stay long enough to reach them. */
const MIN_ACTION_DURATION = 8000;

export interface ToastInput {
  key: string;
  severity: Severity;
  title?: string;
  message: string;
  category: NotificationCategory;
  actions?: NotificationAction[];
  /** ms; null keeps it until dismissed; undefined uses the severity's default. */
  duration?: number | null;
  historyId?: string;
}

export interface Toast {
  id: string;
  key: string;
  severity: Severity;
  title?: string;
  message: string;
  category: NotificationCategory;
  actions: NotificationAction[];
  duration: number | null;
  count: number;
  /** Animating out; removed after EXIT_MS. */
  exiting: boolean;
  historyId?: string;
}

export type HoldReason = 'hover' | 'focus' | 'window';

interface TimerState {
  remaining: number;
  startedAt: number | null;
  handle: ReturnType<typeof setTimeout> | null;
  holds: Set<HoldReason>;
}

export interface ToastSnapshot {
  visible: readonly Toast[];
  queued: readonly Toast[];
}

export function resolveDuration(
  severity: Severity,
  duration: number | null | undefined,
  hasActions: boolean
): number | null {
  if (duration === null) return null;
  const base = duration ?? DEFAULT_DURATION[severity];
  return hasActions ? Math.max(base, MIN_ACTION_DURATION) : base;
}

let nextId = 0;

export class ToastStore {
  private snapshot: ToastSnapshot = { visible: [], queued: [] };
  private listeners = new Set<() => void>();
  private timers = new Map<string, TimerState>();
  private windowHeld = false;

  /** Called with a toast's id when it is dropped from the queue unseen. */
  onDropped?: (toast: Toast) => void;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ToastSnapshot => this.snapshot;

  /** Shows a toast (or merges it into one with the same key). Returns its id. */
  add(input: ToastInput): string {
    const actions = (input.actions ?? []).slice(0, 2);
    const duration = resolveDuration(input.severity, input.duration, actions.length > 0);
    const existing = [...this.snapshot.visible, ...this.snapshot.queued].find(
      toast => toast.key === input.key && !toast.exiting
    );
    if (existing) {
      this.replace(existing.id, {
        ...existing,
        title: input.title,
        message: input.message,
        actions,
        duration,
        count: existing.count + 1,
      });
      if (this.isVisible(existing.id)) this.restartTimer(existing.id, duration);
      return existing.id;
    }

    const toast: Toast = {
      id: `toast-${++nextId}`,
      key: input.key,
      severity: input.severity,
      title: input.title,
      message: input.message,
      category: input.category,
      actions,
      duration,
      count: 1,
      exiting: false,
      historyId: input.historyId,
    };

    const showing = this.snapshot.visible.filter(t => !t.exiting);
    if (showing.length < MAX_VISIBLE) {
      this.show(toast);
      return toast.id;
    }
    const evictable = showing.find(t => t.severity !== 'error' && t.duration !== null);
    if (evictable) {
      this.dismiss(evictable.id);
      this.show(toast);
      return toast.id;
    }
    this.enqueue(toast);
    return toast.id;
  }

  /** Changes a toast's text or buttons in place. */
  update(id: string, changes: Partial<Pick<Toast, 'title' | 'message' | 'actions' | 'severity'>>): void {
    const toast = this.find(id);
    if (toast) this.replace(id, { ...toast, ...changes });
  }

  dismiss(id: string): void {
    const queuedIndex = this.snapshot.queued.findIndex(t => t.id === id);
    if (queuedIndex >= 0) {
      this.set({ ...this.snapshot, queued: this.snapshot.queued.filter(t => t.id !== id) });
      return;
    }
    const toast = this.snapshot.visible.find(t => t.id === id);
    if (!toast || toast.exiting) return;
    this.clearTimer(id);
    this.replace(id, { ...toast, exiting: true });
    setTimeout(() => this.remove(id), EXIT_MS);
  }

  dismissAll(): void {
    this.set({ ...this.snapshot, queued: [] });
    this.snapshot.visible.forEach(t => this.dismiss(t.id));
  }

  /** Stops a toast's time running down until every hold on it is released. */
  hold(id: string, reason: HoldReason): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    timer.holds.add(reason);
    this.stopClock(timer);
  }

  release(id: string, reason: HoldReason): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    timer.holds.delete(reason);
    if (timer.holds.size === 0) {
      timer.remaining = Math.max(timer.remaining, MIN_RESUME_MS);
      this.startClock(id, timer);
    }
  }

  /** You left the window (or came back): holds every toast, including new ones. */
  setWindowHeld(held: boolean): void {
    if (held === this.windowHeld) return;
    this.windowHeld = held;
    for (const id of this.timers.keys()) {
      if (held) this.hold(id, 'window');
      else this.release(id, 'window');
    }
  }

  // --- internals --------------------------------------------------------

  private show(toast: Toast): void {
    this.set({ ...this.snapshot, visible: [...this.snapshot.visible, toast] });
    if (toast.duration !== null) {
      const timer: TimerState = { remaining: toast.duration, startedAt: null, handle: null, holds: new Set() };
      this.timers.set(toast.id, timer);
      if (this.windowHeld) timer.holds.add('window');
      else this.startClock(toast.id, timer);
    }
  }

  private enqueue(toast: Toast): void {
    let queued = [...this.snapshot.queued, toast];
    while (queued.filter(t => t.severity !== 'error').length > MAX_QUEUED) {
      const oldest = queued.find(t => t.severity !== 'error');
      if (!oldest) break;
      queued = queued.filter(t => t !== oldest);
      this.onDropped?.(oldest);
    }
    this.set({ ...this.snapshot, queued });
  }

  private remove(id: string): void {
    this.timers.delete(id);
    let visible = this.snapshot.visible.filter(t => t.id !== id);
    let queued = this.snapshot.queued;
    const next = queued[0];
    if (next && visible.filter(t => !t.exiting).length < MAX_VISIBLE) {
      queued = queued.slice(1);
      visible = [...visible];
      this.set({ visible, queued });
      this.show(next);
      return;
    }
    this.set({ visible, queued });
  }

  private restartTimer(id: string, duration: number | null): void {
    this.clearTimer(id);
    if (duration === null) {
      this.timers.delete(id);
      return;
    }
    const holds = this.timers.get(id)?.holds ?? new Set<HoldReason>();
    const timer: TimerState = { remaining: duration, startedAt: null, handle: null, holds };
    if (this.windowHeld) timer.holds.add('window');
    this.timers.set(id, timer);
    if (timer.holds.size === 0) this.startClock(id, timer);
  }

  private startClock(id: string, timer: TimerState): void {
    if (timer.handle) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => {
      timer.handle = null;
      this.dismiss(id);
    }, timer.remaining);
  }

  private stopClock(timer: TimerState): void {
    if (!timer.handle) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    if (timer.startedAt !== null) {
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
      timer.startedAt = null;
    }
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    if (timer) timer.handle = null;
  }

  private find(id: string): Toast | undefined {
    return [...this.snapshot.visible, ...this.snapshot.queued].find(t => t.id === id);
  }

  private isVisible(id: string): boolean {
    return this.snapshot.visible.some(t => t.id === id);
  }

  private replace(id: string, toast: Toast): void {
    this.set({
      visible: this.snapshot.visible.map(t => (t.id === id ? toast : t)),
      queued: this.snapshot.queued.map(t => (t.id === id ? toast : t)),
    });
  }

  private set(snapshot: ToastSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }
}
