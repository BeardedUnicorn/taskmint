/**
 * Where a notification goes: a toast in the window, the OS, or both. Pure, so
 * the rules are easy to test:
 *
 * - `auto` categories (work-log captures, backups, errors) always show a
 *   toast; they also go to the OS when TaskMint isn't in front.
 * - `always` categories (goal milestones, the daily summary, a scheduled
 *   withdrawal, the test notification) are reminders: they go to the OS, and
 *   also show a toast when you're looking at the app. Turning the category
 *   off silences it completely; with OS notifications switched off
 *   altogether it's a toast. A scheduled withdrawal has no switch: each one
 *   was asked for.
 * - Everything else is a toast only.
 *
 * The OS part needs the master switch and the category's own setting.
 */

import type { NotificationPreferences } from './preferences';
import type { DesktopKind, DesktopRoute, NotificationCategory, Severity } from './types';

type PreferenceKey = Exclude<keyof NotificationPreferences, 'desktopEnabled' | 'sound' | 'dailySummaryTime'>;

interface CategoryRoute {
  route: DesktopRoute;
  kind: DesktopKind;
  /** The setting that allows it; none = always allowed (the test notification). */
  preference?: PreferenceKey;
}

function categoryRoute(category: NotificationCategory, severity: Severity): CategoryRoute | null {
  switch (category) {
    case 'goal':
      return { route: 'always', kind: 'goalMilestone', preference: 'goalMilestones' };
    case 'dailySummary':
      return { route: 'always', kind: 'dailySummary', preference: 'dailySummary' };
    case 'test':
      return { route: 'always', kind: 'test' };
    case 'workLog':
      return { route: 'auto', kind: 'workLogCapture', preference: 'workLogCapture' };
    case 'backup':
      return severity === 'error'
        ? { route: 'auto', kind: 'backupFailure', preference: 'backupFailure' }
        : { route: 'auto', kind: 'backupSuccess', preference: 'backupSuccess' };
    case 'longRun':
      return { route: 'always', kind: 'longRun', preference: 'longRunReminder' };
    case 'idle':
      return { route: 'always', kind: 'idlePause', preference: 'idlePause' };
    case 'withdrawal':
      return { route: 'always', kind: 'withdrawalReady' };
    default:
      return severity === 'error' ? { route: 'auto', kind: 'error', preference: 'errorsWhileAway' } : null;
  }
}

export interface RouteInput {
  category: NotificationCategory;
  severity: Severity;
  /** Overrides the category's route. */
  desktop?: DesktopRoute;
}

export interface RouteContext {
  /** TaskMint's window is in front and visible. */
  attended: boolean;
  preferences: NotificationPreferences;
}

export interface RouteDecision {
  toast: boolean;
  /** The OS notification to send, if any. */
  desktop: DesktopKind | null;
}

export function routeNotification(input: RouteInput, context: RouteContext): RouteDecision {
  const base = categoryRoute(input.category, input.severity);
  const route = input.desktop ?? base?.route ?? 'never';
  const kind = base?.kind ?? 'general';
  const { preferences, attended } = context;

  const categoryOn = !base?.preference || preferences[base.preference];
  const osOn = kind === 'test' || preferences.desktopEnabled;

  if (route === 'always') {
    if (!categoryOn) return { toast: false, desktop: null };
    return { toast: attended || !osOn, desktop: osOn ? kind : null };
  }
  if (route === 'auto') {
    return { toast: true, desktop: osOn && categoryOn && !attended ? kind : null };
  }
  return { toast: true, desktop: null };
}

/**
 * Errors sent to the OS while you're away: at most one per message a minute
 * and three in ten minutes, so a failure that repeats doesn't flood the
 * notification centre. Reset when you come back.
 */
export class ErrorThrottle {
  private lastByKey = new Map<string, number>();
  private recent: number[] = [];

  constructor(
    private readonly perKeyMs = 60_000,
    private readonly windowMs = 10 * 60_000,
    private readonly maxInWindow = 3
  ) {}

  /** Whether an error with this key may go to the OS now (and records it if so). */
  allow(key: string, now = Date.now()): boolean {
    this.recent = this.recent.filter(at => now - at < this.windowMs);
    const last = this.lastByKey.get(key);
    if (last !== undefined && now - last < this.perKeyMs) return false;
    if (this.recent.length >= this.maxInWindow) return false;
    this.lastByKey.set(key, now);
    this.recent.push(now);
    return true;
  }

  reset(): void {
    this.lastByKey.clear();
    this.recent = [];
  }
}
